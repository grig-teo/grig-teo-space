import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { HealthDocument, type HealthDocSource } from '../entities/health-document.entity';
import { HealthDocumentPage } from '../entities/health-document-page.entity';
import { HealthNote } from '../entities/health-note.entity';
import {
  HEALTH_METRICS,
  type HealthMetric,
  HealthReading,
} from '../entities/health-reading.entity';
import { SleepSession } from '../entities/sleep-session.entity';
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
/** Kimi (Moonshot) OpenAI-compatible endpoint; model `k3` is a reasoning
 *  model — its reasoning shares the max_tokens budget, so keep it high. */
const KIMI_ENDPOINT = 'https://api.kimi.com/coding/v1/chat/completions';

const DOCTOR_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_metric_series',
      description:
        'Smart-ring metric readings (heart_rate, spo2, steps, calories, distance_km, stress, hrv) over ANY time range. Returns count/avg/min/max and a downsampled series.',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: [...HEALTH_METRICS] },
          from: { type: 'string', description: 'ISO date/datetime, e.g. 2026-08-01' },
          to: { type: 'string', description: 'ISO date/datetime (default: now)' },
        },
        required: ['metric', 'from'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sleep_sessions',
      description: 'Sleep nights with stage breakdown (deep/REM/light/awake minutes) and score over a time range.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
        },
        required: ['from'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_notes',
      description:
        'Journal notes the owner logged (feelings, food, plans) with timestamps and photo descriptions. Note ids are included when a photo can be viewed with view_note_photo.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
        },
        required: ['from'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_activities',
      description: 'Auto-detected activity windows (walks/workouts) with steps, km, avg/peak heart rate over a time range.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
        },
        required: ['from'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_documents',
      description: 'Lists scanned medical documents (id, title, date, page count).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_document',
      description: 'Full OCR text of one scanned document by id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'view_document_page',
      description: 'See the actual scanned IMAGE of a document page (use when OCR text is unclear or layout matters).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'document id' },
          page: { type: 'number', description: 'page number, 1-based' },
        },
        required: ['id', 'page'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'view_note_photo',
      description: 'See the photo attached to a journal note by note id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'note id' } },
        required: ['id'],
      },
    },
  },
];

const MAX_TOOL_ROUNDS = 6;

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
  '- Be concise and structured (use short paragraphs or bullet points).\n' +
  '- Format EVERY answer in Markdown: a short bold lead, then bullet points ' +
  'or small sections. Never return one plain-text wall.\n' +
  '- Prefer bullet lists over tables — the chat bubble is narrow. Use a ' +
  'table only when the user explicitly asks for one.\n' +
  '- You have TOOLS to query the owner\'s full health database: any ring ' +
  'metric over any date range, sleep nights with stages, journal notes ' +
  '(feelings/food/plans, with photos you can view), detected activities, ' +
  'and the scanned documents\' text AND page images. When a question needs ' +
  'historical data, USE THE TOOLS — never guess numbers you can look up.\n\n' +
  'IMPORTANT safety boundaries:\n' +
  '- You are NOT a replacement for a real physician. Always remind the user to consult ' +
  'their doctor before making medical decisions, changing medication, or acting on your ' +
  'analysis, especially for anything urgent or concerning.\n' +
  '- If the answer is not present in the provided context, say so plainly rather than ' +
  'speculating. Do not invent lab values or diagnoses.\n' +
  '- In any perceived emergency, tell the user to contact emergency services immediately.';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(HealthDocument)
    private readonly docRepo: Repository<HealthDocument>,
    @InjectRepository(HealthDocumentPage)
    private readonly pageRepo: Repository<HealthDocumentPage>,
    @InjectRepository(HealthDocChatMessage)
    private readonly chatRepo: Repository<HealthDocChatMessage>,
    @InjectRepository(HealthReading)
    private readonly readingRepo: Repository<HealthReading>,
    @InjectRepository(HealthNote)
    private readonly noteRepo: Repository<HealthNote>,
    @InjectRepository(SleepSession)
    private readonly sleepRepo: Repository<SleepSession>,
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

    // Kimi k3 (KIMI_API_KEY) is the primary model; DeepSeek is the fallback
    // when no Kimi key is configured.
    const kimiKey = process.env.KIMI_API_KEY?.trim();
    const apiKey = kimiKey || process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('Records AI chat is not configured');
    }
    const endpoint = kimiKey ? KIMI_ENDPOINT : DEEPSEEK_ENDPOINT;
    const model = kimiKey
      ? process.env.KIMI_MODEL?.trim() || 'k3'
      : process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';

    const context = await this.buildContext(message);
    const history = await this.recentHistory(normalizedSessionId);

    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: DOCTOR_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `Current date/time: ${new Date().toISOString().slice(0, 16)}Z (UTC). ` +
          'Use it to resolve "this week", "last month", etc. into tool date ranges.\n\n' +
          `Health context:\n${context}\n\nMy question:\n${message}`,
      },
      ...history,
    ];

    const answer = await this.answerWithTools(endpoint, apiKey, model, messages);
    await this.saveChatMessage(normalizedSessionId, 'assistant', answer);
    return answer;
  }

  /**
   * Tool-calling loop: the model can query the full health database (any
   * metric/range, sleep nights, notes, activities, document text and page
   * images) before answering. Runs at most MAX_TOOL_ROUNDS lookups.
   */
  private async answerWithTools(
    endpoint: string,
    apiKey: string,
    model: string,
    messages: Array<Record<string, unknown>>,
  ): Promise<string> {
    let current = messages;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const reply = await this.callDoctorModel(endpoint, apiKey, model, current);
      const calls = reply.tool_calls ?? [];
      if (calls.length === 0) {
        const answer = reply.content?.trim();
        if (!answer) throw new InternalServerErrorException('Empty AI response');
        return answer;
      }
      current = [...current, { role: 'assistant', content: reply.content ?? '', tool_calls: calls }];
      // Every tool_call MUST get a tool message, or the next round 400s.
      // Execute up to 4 per round; extras get a skip notice.
      for (const [index, call] of calls.entries()) {
        this.logger.log(`doctor tool round ${round + 1}: ${call.function.name} ${call.function.arguments}`);
        const content =
          index < 4
            ? await this.runDoctorTool(call.function.name, call.function.arguments)
            : 'Skipped: too many parallel lookups — call the remaining tools one per round.';
        current = [...current, { role: 'tool', tool_call_id: call.id, content }];
      }
    }
    throw new InternalServerErrorException('The AI doctor made too many data lookups');
  }

  /** One chat completion round with the tool definitions attached. */
  private async callDoctorModel(
    endpoint: string,
    apiKey: string,
    model: string,
    messages: Array<Record<string, unknown>>,
  ) {
    const isKimi = endpoint === KIMI_ENDPOINT;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: DOCTOR_TOOLS,
        // k3 is a reasoning model and rejects any temperature ≠ 1.
        ...(isKimi ? {} : { temperature: 0.3 }),
        // Generous ceiling so structured medical answers (bullets, ranges,
        // explanations) aren't cut off mid-sentence. k3's reasoning shares
        // this budget — do not lower it.
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new BadGatewayException(`AI API error: ${response.status} ${raw.slice(0, 300)}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      }>;
    };
    const message = payload.choices?.[0]?.message;
    if (!message) throw new InternalServerErrorException('Empty AI response');
    return message;
  }

  /** Executes one doctor tool; errors come back as text so the model can
   *  recover instead of failing the whole answer. */
  private async runDoctorTool(
    name: string,
    rawArgs: string,
  ): Promise<string | Array<Record<string, unknown>>> {
    try {
      const args = rawArgs ? JSON.parse(rawArgs) : {};
      return await this.dispatchDoctorTool(name, args);
    } catch (error) {
      return `Tool "${name}" failed: ${(error as Error).message}`;
    }
  }

  private dispatchDoctorTool(
    name: string,
    args: Record<string, never>,
  ): Promise<string | Array<Record<string, unknown>>> {
    switch (name) {
      case 'get_metric_series':
        return this.toolMetricSeries(args);
      case 'get_sleep_sessions':
        return this.toolSleepSessions(args);
      case 'get_notes':
        return this.toolNotes(args);
      case 'get_activities':
        return this.toolActivities(args);
      case 'list_documents':
        return this.toolListDocuments();
      case 'read_document':
        return this.toolReadDocument(args);
      case 'view_document_page':
        return this.toolViewDocumentPage(args);
      case 'view_note_photo':
        return this.toolViewNotePhoto(args);
      default:
        return Promise.resolve(`Unknown tool "${name}"`);
    }
  }

  // --- Doctor tools ----------------------------------------------------------

  /** Parses from/to args into a bounded date range (defaults: last 30 days). */
  private toolRange(args: { from?: string; to?: string }): { from: Date; to: Date } {
    const to = args.to ? new Date(args.to) : new Date();
    const from = args.from ? new Date(args.from) : new Date(to.getTime() - 30 * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new BadRequestException('Invalid from/to dates');
    }
    const earliest = new Date(to.getTime() - 400 * 86400000);
    return { from: from < earliest ? earliest : from, to };
  }

  private async toolMetricSeries(args: { metric?: string; from?: string; to?: string }): Promise<string> {
    const metric = args.metric as HealthMetric;
    if (!HEALTH_METRICS.includes(metric)) {
      return `Unknown metric. Valid: ${HEALTH_METRICS.join(', ')}`;
    }
    const { from, to } = this.toolRange(args);
    const rows = await this.readingRepo.find({
      where: { metric, recordedAt: Between(from, to) },
      order: { recordedAt: 'ASC' },
    });
    if (rows.length === 0) return `No ${metric} readings in that range.`;
    const values = rows.map((r) => r.value);
    const avg = values.reduce((a, v) => a + v, 0) / values.length;
    const stride = Math.ceil(rows.length / 100);
    const points = rows
      .filter((_, i) => i % stride === 0)
      .map((r) => `${r.recordedAt.toISOString().slice(0, 16)}=${r.value}`);
    return JSON.stringify({
      metric,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      count: rows.length,
      avg: Math.round(avg * 100) / 100,
      min: Math.min(...values),
      max: Math.max(...values),
      points,
    });
  }

  private async toolSleepSessions(args: { from?: string; to?: string }): Promise<string> {
    const { from, to } = this.toolRange(args);
    const rows = await this.sleepRepo.find({
      where: { endedAt: Between(from, to) },
      order: { endedAt: 'DESC' },
    });
    if (rows.length === 0) return 'No sleep sessions in that range.';
    return JSON.stringify(
      rows.map((r) => ({
        night: `${r.startedAt.toISOString().slice(0, 16)} → ${r.endedAt.toISOString().slice(0, 16)}`,
        durationH: Math.round((r.durationMin / 60) * 10) / 10,
        score: r.score,
        deepMin: r.deepMin,
        remMin: r.remMin,
        lightMin: r.lightMin,
        awakeMin: r.awakeMin,
      })),
    );
  }

  private async toolNotes(args: { from?: string; to?: string }): Promise<string> {
    const { from, to } = this.toolRange(args);
    const rows = await this.noteRepo.find({
      where: { recordedAt: Between(from, to) },
      order: { recordedAt: 'ASC' },
      take: 200,
    });
    if (rows.length === 0) return 'No notes in that range.';
    return JSON.stringify(
      rows.map((n) => ({
        id: n.mediaType === 'photo' ? n.id : undefined,
        at: n.recordedAt.toISOString().slice(0, 16),
        content: n.content,
        mood: n.mood,
        photo: n.mediaNote ?? (n.mediaType === 'photo' ? 'attached (not analyzed)' : undefined),
        video: n.mediaType === 'video' ? true : undefined,
      })),
    );
  }

  private async toolActivities(args: { from?: string; to?: string }): Promise<string> {
    const { from, to } = this.toolRange(args);
    const days = Math.min(365, Math.ceil((Date.now() - from.getTime()) / 86400000));
    const activities = await this.health.getActivities(days);
    const inRange = activities.filter((a) => {
      const start = new Date(a.start);
      return start >= from && start <= to;
    });
    if (inRange.length === 0) return 'No detected activities in that range.';
    return JSON.stringify(inRange);
  }

  private async toolListDocuments(): Promise<string> {
    const docs = await this.docRepo.find({
      order: { recordedAt: 'DESC' },
      take: 50,
    });
    if (docs.length === 0) return 'No scanned documents.';
    return JSON.stringify(
      docs.map((d) => ({
        id: d.id,
        title: d.title,
        date: d.recordedAt.toISOString().slice(0, 10),
        pages: d.pageCount,
      })),
    );
  }

  private async toolReadDocument(args: { id?: string }): Promise<string> {
    const doc = await this.docRepo.findOne({ where: { id: args.id } });
    if (!doc) return 'Document not found.';
    const pages = await this.pageRepo.find({
      where: { documentId: doc.id },
      order: { pageNumber: 'ASC' },
    });
    const text = pages.length > 0 ? pages.map((p) => p.ocrText).join('\n\n') : doc.ocrText;
    return `Document "${doc.title}" (${doc.recordedAt.toISOString().slice(0, 10)}):\n${text.slice(0, 9000)}`;
  }

  private async toolViewDocumentPage(args: { id?: string; page?: number }): Promise<Array<Record<string, unknown>>> {
    const page = await this.pageRepo.findOne({
      where: { documentId: args.id, pageNumber: args.page ?? 1 },
    });
    const doc = page ? null : await this.docRepo.findOne({ where: { id: args.id } });
    const imageUrl = page?.imageUrl ?? doc?.imageUrl;
    if (!imageUrl) return [{ type: 'text', text: 'Document page not found.' }];
    const buffer = await this.fetchImage(imageUrl);
    if (!buffer) return [{ type: 'text', text: 'Could not load the page image.' }];
    return [
      { type: 'text', text: `Scanned page ${args.page ?? 1} of document ${args.id}:` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` } },
    ];
  }

  private async toolViewNotePhoto(args: { id?: string }): Promise<Array<Record<string, unknown>>> {
    const note = await this.noteRepo.findOne({ where: { id: args.id } });
    if (!note?.mediaKey || note.mediaType !== 'photo') {
      return [{ type: 'text', text: 'Note photo not found.' }];
    }
    const buffer = await this.storage.getPrivateBuffer(note.mediaKey);
    if (buffer.length > 8 * 1024 * 1024) {
      return [{ type: 'text', text: 'Photo is too large to analyze.' }];
    }
    return [
      { type: 'text', text: `Photo attached to note "${note.content.slice(0, 80)}":` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` } },
    ];
  }

  /** Fetches a public-bucket image (document scans) with a size cap. */
  private async fetchImage(url: string): Promise<Buffer | null> {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > 8 * 1024 * 1024 ? null : buffer;
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
    // Note: Postgres lowercases the alias, so the raw key is "document_id"
    // (the column name), not "documentId". Bracket access is safe for both.
    const rows = await this.pageRepo
      .createQueryBuilder('p')
      .select('p.document_id', 'documentId')
      .addSelect('COUNT(*)', 'count')
      .where('p.document_id IN (:...ids)', { ids })
      .groupBy('p.document_id')
      .getRawMany<{ documentId: string; count: string }>();
    const map: Record<string, number> = {};
    for (const row of rows) {
      // TypeORM's getRawMany may return the alias or the column name depending
      // on the driver; bracket access handles both.
      const id = (row as Record<string, string>).documentId ?? (row as Record<string, string>).document_id ?? '';
      if (id) {
        map[id] = Number(row.count);
      }
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
