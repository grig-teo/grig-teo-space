import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthDocument, type HealthDocSource } from '../entities/health-document.entity';
import {
  HealthDocChatMessage,
  type HealthDocChatRole,
} from '../entities/health-doc-chat-message.entity';
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

export type DocumentListResult = {
  items: DocumentListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

// --- GLM chat types ------------------------------------------------------

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
const MAX_CONTEXT_CHARS = 24000; // ~fits in GLM's context window with headroom
const GLM_ENDPOINT = 'https://api.z.ai/api/coding/paas/v4/chat/completions';

const DOCTOR_SYSTEM_PROMPT =
  'You are a knowledgeable medical doctor assisting the owner of these health records. ' +
  'You will be given the text content of medical documents they scanned (lab results, ' +
  'prescriptions, doctor notes, etc.) as context.\n\n' +
  'How to answer:\n' +
  '- Analyze the provided documents and explain what the values, terms, and findings mean ' +
  'in clear, accessible language.\n' +
  '- Highlight anything that appears outside normal ranges or worth attention.\n' +
  '- Connect information across documents when relevant (e.g. trends over time).\n' +
  '- Be concise and structured (use short paragraphs or bullet points).\n\n' +
  'IMPORTANT safety boundaries:\n' +
  '- You are NOT a replacement for a real physician. Always remind the user to consult ' +
  'their doctor before making medical decisions, changing medication, or acting on your ' +
  'analysis, especially for anything urgent or concerning.\n' +
  '- If the answer is not present in the provided documents, say so plainly rather than ' +
  'speculating. Do not invent lab values or diagnoses.\n' +
  '- In any perceived emergency, tell the user to contact emergency services immediately.';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(HealthDocument)
    private readonly docRepo: Repository<HealthDocument>,
    @InjectRepository(HealthDocChatMessage)
    private readonly chatRepo: Repository<HealthDocChatMessage>,
    private readonly storage: StorageService,
  ) {}

  // --- Upload + storage --------------------------------------------------

  async create(input: CreateDocumentInput): Promise<HealthDocument> {
    const ocrText = (input.ocrText ?? '').trim();
    if (!input.image) {
      throw new BadRequestException('An image file is required');
    }

    const imageUrl = await this.storage.upload(input.image, 'documents');
    const title = (input.title ?? '').trim() || this.titleFromText(ocrText) || 'Scanned document';

    const doc = this.docRepo.create({
      title: title.slice(0, 160),
      ocrText: ocrText.slice(0, 100000),
      imageUrl,
      thumbUrl: null,
      pageCount: 1,
      language: input.language?.trim().slice(0, 8) || null,
      source: input.source ?? 'app',
      recordedAt: this.parseDate(input.recordedAt) ?? new Date(),
    });
    return this.docRepo.save(doc);
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
    return {
      items: rows.map((row) => this.toListItem(row)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  // --- AI doctor chat (GLM-5.2 over Z.ai) --------------------------------

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

    const apiKey = process.env.GLM_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('Records AI chat is not configured');
    }

    const context = await this.buildContext(message);
    const history = await this.recentHistory(normalizedSessionId);

    const messages: GlmMessage[] = [
      { role: 'system', content: DOCTOR_SYSTEM_PROMPT },
      { role: 'user', content: `Health documents:\n${context}\n\nMy question:\n${message}` },
      ...history,
    ];

    const model = process.env.GLM_MODEL?.trim() || 'glm-4.6';
    const response = await fetch(GLM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new BadGatewayException(`GLM API error: ${response.status} ${raw.slice(0, 300)}`);
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

  private async buildContext(question: string): Promise<string> {
    const docs = await this.docRepo.find({
      order: { recordedAt: 'DESC' },
      take: 100,
    });

    // Rank docs by simple keyword overlap with the question so the most
    // relevant ones fit within the context budget.
    const terms = this.tokenize(question);
    const scored = docs
      .map((doc) => {
        const haystack = `${doc.title} ${doc.ocrText}`.toLowerCase();
        let score = terms.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
        return { doc, score };
      })
      .sort((a, b) => b.score - a.score || b.doc.recordedAt.getTime() - a.doc.recordedAt.getTime());

    const blocks: string[] = [];
    let used = 0;
    for (const { doc, score } of scored) {
      const trimmed = doc.ocrText.trim();
      if (!trimmed) continue;
      // Drop docs that have zero keyword overlap once we already have content,
      // to keep the prompt focused (still included if nothing matched at all).
      if (score === 0 && blocks.length >= 3) continue;

      const block =
        `[${doc.recordedAt.toISOString().slice(0, 10)}] ${doc.title}\n` + trimmed;
      if (used + block.length > MAX_CONTEXT_CHARS) break;
      blocks.push(block);
      used += block.length;
    }
    return blocks.length > 0
      ? blocks.join('\n\n---\n\n')
      : 'No scanned health documents available yet.';
  }

  private async recentHistory(sessionId: string): Promise<GlmMessage[]> {
    const rows = await this.chatRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: 8,
    });
    // Chronological, excluding the just-saved user question (it's already in the prompt).
    return rows
      .reverse()
      .slice(0, -1)
      .map((r) => ({ role: r.role, content: r.content }));
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

  private toListItem(doc: HealthDocument): DocumentListItem {
    const text = doc.ocrText.replace(/\s+/g, ' ').trim();
    return {
      id: doc.id,
      title: doc.title,
      snippet: text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH)}…` : text,
      imageUrl: doc.imageUrl,
      thumbUrl: doc.thumbUrl,
      pageCount: doc.pageCount,
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
