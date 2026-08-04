import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthDocument, type HealthDocSource } from '../entities/health-document.entity';
import { HealthDocumentPage } from '../entities/health-document-page.entity';
import {
  HealthDocChatMessage,
  type HealthDocChatRole,
} from '../entities/health-doc-chat-message.entity';
import { HealthService, METRIC_LABELS } from '../health/health.service';
import { StorageService } from '../storage/storage.service';

// --- DTOs ----------------------------------------------------------------

export type CreateDocumentInput = {
  title?: string;
  ocrText?: string;
  image?: Express.Multer.File;
  language?: string | null;
  source?: HealthDocSource;
  recordedAt?: string;
};

export type AddPageInput = {
  ocrText?: string;
  image?: Express.Multer.File;
};

export type DocumentPageDto = {
  id: string;
  pageNumber: number;
  ocrText: string;
  imageUrl: string;
};

export type DocumentListItem = {
  id: string;
  title: string;
  snippet: string;
  imageUrl: string;
  thumbUrl: string | null;
  pageCount: number;
  language: string | null;
  source: string;
  recordedAt: string;
};

export type DocumentDetail = DocumentListItem & {
  pages: DocumentPageDto[];
};

export type DocumentListResult = {
  items: DocumentListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

// --- AI chat types ------------------------------------------------------

type GlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type SavedChatMessage = {
  role: HealthDocChatRole;
  content: string;
  createdAt: string;
};

const SNIPPET_LENGTH = 140;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;
const MAX_HISTORY_MESSAGES = 50;
const MAX_CONTEXT_CHARS = 24000;
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

const DOCTOR_SYSTEM_PROMPT =
  'You are a knowledgeable medical doctor assisting the owner of these health records. ' +
  'You are given THREE kinds of context:\n' +
  '1. Their body stats (height, weight, BMI).\n' +
  '2. Their smart-ring metrics from the last 24 hours (heart rate, SpO2, steps, calories, ' +
  'distance, stress, HRV, sleep).\n' +
  '3. The text content of medical documents they scanned (lab results, prescriptions, ' +
  'doctor notes, etc.).\n\n' +
  'How to answer:\n' +
  '- Use ALL available context: cross-reference the ring data and body stats with the ' +
  'scanned documents when relevant (e.g. relate resting heart rate trends to lab values).\n' +
  '- Explain values, terms, and findings in clear, accessible language.\n' +
  '- Highlight anything that appears outside normal ranges or worth attention.\n' +
  '- Connect information across sources when relevant (e.g. trends over time).\n' +
  '- Be concise and structured (use short paragraphs or bullet points).\n\n' +
  'IMPORTANT safety boundaries:\n' +
  '- You are NOT a replacement for a real physician. Always remind the user to consult ' +
  'their doctor before making medical decisions, changing medication, or acting on your ' +
  'analysis, especially for anything urgent or concerning.\n' +
  '- If the answer is not present in the provided context, say so plainly rather than ' +
  'speculating. Do not invent lab values or diagnoses.\n' +
  '- In any perceived emergency, tell the user to contact emergency services immediately.';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(HealthDocument)
    private readonly docRepo: Repository<HealthDocument>,
    @InjectRepository(HealthDocumentPage)
    private readonly pageRepo: Repository<HealthDocumentPage>,
    @InjectRepository(HealthDocChatMessage)
    private readonly chatRepo: Repository<HealthDocChatMessage>,
    private readonly storage: StorageService,
    private readonly health: HealthService,
  ) {}

  // --- Upload + storage --------------------------------------------------

  async create(input: CreateDocumentInput): Promise<HealthDocument> {
    const page = this.validatePageInput(input.image, input.ocrText);
    const imageUrl = await this.storage.upload(page.image, 'documents');
    const ocrText = page.ocrText;
    const title = (input.title ?? '').trim() || this.titleFromText(ocrText) || 'Scanned document';

    const doc = await this.docRepo.save({
      title: title.slice(0, 160),
      ocrText: ocrText.slice(0, 100000),
      imageUrl,
      thumbUrl: null,
      pageCount: 1,
      language: input.language?.trim().slice(0, 8) || null,
      source: input.source ?? 'app',
      recordedAt: this.parseDate(input.recordedAt) ?? new Date(),
    });

    await this.pageRepo.save({
      documentId: doc.id,
      pageNumber: 1,
      ocrText: ocrText.slice(0, 100000),
      imageUrl,
    });
    return doc;
  }

  /** Appends a new page (image + OCR text) to an existing document. */
  async addPage(documentId: string, input: AddPageInput): Promise<HealthDocumentPage> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    const page = this.validatePageInput(input.image, input.ocrText);
    const imageUrl = await this.storage.upload(page.image, 'documents');

    // Backfill: docs created before the page-entity refactor store their
    // content only on the parent row. Materialize that as page 1 first.
    await this.ensureFirstPageExists(doc);

    const existing = await this.pageRepo.count({ where: { documentId } });
    const pageNumber = existing + 1;

    const saved = await this.pageRepo.save({
      documentId,
      pageNumber,
      ocrText: page.ocrText.slice(0, 100000),
      imageUrl,
    });

    // Update the parent doc's aggregated OCR text + page count.
    doc.pageCount = pageNumber;
    doc.ocrText = await this.aggregateOcrText(documentId);
    await this.docRepo.save(doc);
    return saved;
  }

  /** Permanently deletes a document and all its pages (+ MinIO objects). */
  async delete(documentId: string): Promise<{ id: string }> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    const pages = await this.pageRepo.find({ where: { documentId } });

    // Best-effort removal of stored images (don't fail the delete on storage errors).
    await this.storage.removeByUrl(doc.imageUrl);
    for (const page of pages) {
      if (page.imageUrl !== doc.imageUrl) {
        await this.storage.removeByUrl(page.imageUrl);
      }
    }

    await this.pageRepo.delete({ documentId });
    await this.docRepo.delete(documentId);
    return { id: documentId };
  }

  /** Full detail incl. all pages (for the iOS document viewer). */
  async getDetail(documentId: string): Promise<DocumentDetail> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    await this.ensureFirstPageExists(doc);
    const pages = await this.pageRepo.find({
      where: { documentId },
      order: { pageNumber: 'ASC' },
    });
    const base = this.toListItem(doc, pages.length);
    return {
      ...base,
      pageCount: pages.length,
      pages: pages.map((p) => ({
        id: p.id,
        pageNumber: p.pageNumber,
        ocrText: p.ocrText,
        imageUrl: p.imageUrl,
      })),
    };
  }

  // --- Paginated, searchable list ----------------------------------------

  async list(params: {
    query?: string;
    page?: number;
    pageSize?: number;
  }): Promise<DocumentListResult> {
    const page = Math.max(1, Math.floor(Number(params.page ?? 1) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(params.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE)),
    );
    const query = (params.query ?? '').trim();

    const qb = this.docRepo
      .createQueryBuilder('d')
      .orderBy('d.recordedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (query) {
      qb.andWhere('(d.title ILIKE :q OR d.ocrText ILIKE :q)', { q: `%${query}%` });
    }

    const [rows, total] = await qb.getManyAndCount();

    // Fetch page counts in one query for the visible rows.
    const counts = await this.pageCountsFor(rows.map((r) => r.id));

    return {
      items: rows.map((row) => this.toListItem(row, counts[row.id] ?? row.pageCount)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  // --- AI doctor chat (DeepSeek) ------------------------------------

  async getChatHistory(sessionId: string): Promise<SavedChatMessage[]> {
    const normalized = this.normalizeSessionId(sessionId);
    const rows = await this.chatRepo.find({
      where: { sessionId: normalized },
      order: { createdAt: 'ASC' },
      take: MAX_HISTORY_MESSAGES,
    });
    return rows.map((row) => ({
      role: row.role,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async answerQuestion(message: string, sessionId: string): Promise<string> {
    const normalizedSessionId = this.normalizeSessionId(sessionId);
    await this.saveChatMessage(normalizedSessionId, 'user', message);

    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('Records AI chat is not configured');
    }

    const context = await this.buildContext(message);
    const history = await this.recentHistory(normalizedSessionId);

    const messages: GlmMessage[] = [
      { role: 'system', content: DOCTOR_SYSTEM_PROMPT },
      { role: 'user', content: `Health context:\n${context}\n\nMy question:\n${message}` },
      ...history,
    ];

    const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';
    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        // Generous ceiling so structured medical answers (bullets, ranges,
        // explanations) aren't cut off mid-sentence.
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new BadGatewayException(`DeepSeek API error: ${response.status} ${raw.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new InternalServerErrorException('Empty AI response');
    }

    await this.saveChatMessage(normalizedSessionId, 'assistant', answer);
    return answer;
  }

  // --- Helpers -----------------------------------------------------------

  /**
   * Backfills a page-1 row for documents created before the page-entity
   * refactor (their content lived only on the parent row). No-op once a page
   * row exists. Keeps detail/addPage/delete consistent for legacy data.
   */
  private async ensureFirstPageExists(doc: HealthDocument): Promise<void> {
    const count = await this.pageRepo.count({ where: { documentId: doc.id } });
    if (count > 0) return;
    await this.pageRepo.save({
      documentId: doc.id,
      pageNumber: 1,
      ocrText: doc.ocrText,
      imageUrl: doc.imageUrl,
    });
  }

  /** Concatenates every page's OCR text, in page order, as search/AI context. */
  private async aggregateOcrText(documentId: string): Promise<string> {
    const pages = await this.pageRepo.find({
      where: { documentId },
      order: { pageNumber: 'ASC' },
    });
    return pages.map((p) => p.ocrText.trim()).filter(Boolean).join('\n\n---\n\n');
  }

  private async pageCountsFor(ids: string[]): Promise<Record<string, number>> {
    if (ids.length === 0) return {};
    const rows = await this.pageRepo
      .createQueryBuilder('p')
      .select('p.document_id', 'documentId')
      .addSelect('COUNT(*)::int', 'count')
      .where('p.document_id IN (:...ids)', { ids })
      .groupBy('p.document_id')
      .getRawMany<{ documentid: string; count: number }>();
    const map: Record<string, number> = {};
    for (const row of rows) {
      map[row.documentid] = row.count;
    }
    return map;
  }

  private async buildContext(question: string): Promise<string> {
    // Body stats + ring summary are fetched alongside the document selection so
    // the AI doctor sees the full health picture, not just scanned records.
    const [docBlock, bodyBlock, ringBlock] = await Promise.all([
      this.buildDocContext(question),
      this.buildBodyContext(),
      this.buildRingContext(),
    ]);
    return [bodyBlock, ringBlock, docBlock].filter(Boolean).join('\n\n---\n\n');
  }

  /** Selects scanned documents by keyword overlap with the question. */
  private async buildDocContext(question: string): Promise<string> {
    const docs = await this.docRepo.find({
      order: { recordedAt: 'DESC' },
      take: 100,
    });

    const terms = this.tokenize(question);
    const scored = docs
      .map((doc) => {
        const haystack = `${doc.title} ${doc.ocrText}`.toLowerCase();
        const score = terms.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
        return { doc, score };
      })
      .sort((a, b) => b.score - a.score || b.doc.recordedAt.getTime() - a.doc.recordedAt.getTime());

    const blocks: string[] = [];
    let used = 0;
    for (const { doc, score } of scored) {
      const trimmed = doc.ocrText.trim();
      if (!trimmed) continue;
      if (score === 0 && blocks.length >= 3) continue;

      const block = `[${doc.recordedAt.toISOString().slice(0, 10)}] ${doc.title}\n` + trimmed;
      if (used + block.length > MAX_CONTEXT_CHARS) break;
      blocks.push(block);
      used += block.length;
    }
    if (blocks.length === 0) return 'No scanned health documents available yet.';
    const header = blocks.length === 1 ? 'Scanned document:' : 'Scanned documents:';
    return `${header}\n${blocks.join('\n\n---\n\n')}`;
  }

  /** Compact body-stats block (height, weight, BMI). */
  private async buildBodyContext(): Promise<string> {
    const body = await this.health.getBodyStats();
    return `Body stats (updated ${body.updatedAt.slice(0, 10)}):\n` +
      `- Height: ${body.heightCm} cm\n` +
      `- Weight: ${body.weightKg} kg\n` +
      `- BMI: ${body.bmi}`;
  }

  /** Last-24h ring averages for the 9 metrics. */
  private async buildRingContext(): Promise<string> {
    const summary = await this.health.getSummary(1);
    const lines = summary.metrics
      .filter((m) => m.count > 0)
      .map((m) => {
        const label = METRIC_LABELS[m.metric] ?? m.metric;
        const latest = m.latest ? `, latest ${m.latest.value}` : '';
        return `- ${label}: avg ${m.avg}${latest}`;
      });
    if (lines.length === 0) return 'Ring data: no readings in the last 24 hours.';
    return `Ring metrics (last 24 hours, averages):\n${lines.join('\n')}`;
  }

  private async recentHistory(sessionId: string): Promise<GlmMessage[]> {
    const rows = await this.chatRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: 8,
    });
    return rows
      .reverse()
      .slice(0, -1)
      .map((r) => ({ role: r.role, content: r.content }));
  }

  private validatePageInput(
    image: Express.Multer.File | undefined,
    ocrText: string | undefined,
  ): { image: Express.Multer.File; ocrText: string } {
    if (!image) {
      throw new BadRequestException('An image file is required');
    }
    return { image, ocrText: (ocrText ?? '').trim() };
  }

  private normalizeSessionId(sessionId: string): string {
    const value = sessionId.trim();
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(value)) {
      throw new BadRequestException('Invalid chat session id');
    }
    return value;
  }

  private async saveChatMessage(
    sessionId: string,
    role: HealthDocChatRole,
    content: string,
  ): Promise<void> {
    await this.chatRepo.save({
      sessionId,
      role,
      content: content.slice(0, 8000),
    });
  }

  private toListItem(doc: HealthDocument, pageCount?: number): DocumentListItem {
    const text = doc.ocrText.replace(/\s+/g, ' ').trim();
    return {
      id: doc.id,
      title: doc.title,
      snippet: text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH)}…` : text,
      imageUrl: doc.imageUrl,
      thumbUrl: doc.thumbUrl,
      pageCount: pageCount ?? doc.pageCount,
      language: doc.language,
      source: doc.source,
      recordedAt: doc.recordedAt.toISOString(),
    };
  }

  private titleFromText(text: string): string | null {
    const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean);
    if (!firstLine) return null;
    return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
  }

  private tokenize(value: string): string[] {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 2);
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
