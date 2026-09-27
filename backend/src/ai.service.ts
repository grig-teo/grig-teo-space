import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentService } from './content/content.service';
import { AiChatMessage, type AiChatRole } from './entities/ai-chat-message.entity';
import { HUMANIZER_SKILL } from './humanizer/humanizer.skill';
import { LinkedInService } from './linkedin.service';
import { WhisperService } from './whisper/whisper.service';
import type {
  BlogPost,
  ExperienceItem,
  Locale,
  LocalizedList,
  LocalizedString,
  Profile,
  Project,
} from './types';

type ContextDoc = {
  type: 'profile' | 'project' | 'experience' | 'blog';
  id: string;
  title: string;
  content: string;
};

type DeepseekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type BlockNoteInline = {
  text?: string;
};

type BlockNoteBlock = {
  content?: BlockNoteInline[] | string;
  children?: BlockNoteBlock[];
};

type SavedChatMessage = {
  role: AiChatRole;
  content: string;
  createdAt: string;
};

/** Whether a turn was typed or spoken — spoken turns get shorter, plainer replies. */
export type AnswerMode = 'text' | 'voice';

@Injectable()
export class AiService {
  private static readonly maxHistoryMessages = 100;

  constructor(
    private readonly content: ContentService,
    private readonly linkedin: LinkedInService,
    private readonly whisper: WhisperService,
    @InjectRepository(AiChatMessage)
    private readonly chatRepo: Repository<AiChatMessage>,
  ) {}

  async getChatHistory(sessionId: string): Promise<SavedChatMessage[]> {
    const normalizedSessionId = this.normalizeSessionId(sessionId);
    const rows = await this.chatRepo.find({
      where: { sessionId: normalizedSessionId },
      order: { createdAt: 'ASC' },
      take: AiService.maxHistoryMessages,
    });

    return rows.map((row) => ({
      role: row.role,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * One voice turn: transcribe the clip, then answer from the same grounded
   * context as a typed question, so speaking to the site and typing to it draw
   * on exactly the same data.
   *
   * An empty transcript means the clip held no recognizable speech; the caller
   * reports that to the visitor instead of asking the model about nothing.
   */
  async answerVoice(
    audio: Buffer,
    filename: string,
    locale: Locale,
    sessionId: string,
  ): Promise<{ transcript: string; answer: string }> {
    const transcript = await this.whisper.transcribe(audio, filename);
    if (!transcript) {
      return { transcript: '', answer: '' };
    }
    const answer = await this.answerQuestion(transcript, locale, sessionId, 'voice');
    return { transcript, answer };
  }

  async answerQuestion(
    message: string,
    locale: Locale,
    sessionId: string,
    mode: AnswerMode = 'text',
  ): Promise<string> {
    const normalizedSessionId = this.normalizeSessionId(sessionId);
    await this.saveChatMessage(normalizedSessionId, 'user', message, locale);

    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('AI chat is not configured yet');
    }

    const messages = await this.buildMessages(normalizedSessionId, message, locale, mode);
    const answer = await this.completeAnswer(apiKey, messages);
    // A spoken reply is read aloud, so markdown would be pronounced as
    // punctuation rather than shown. Strip it before storing or returning:
    // the transcript of a voice turn should read like the transcript of a call.
    const delivered = mode === 'voice' ? toSpokenText(answer) : answer;

    await this.saveChatMessage(normalizedSessionId, 'assistant', delivered, locale);
    return delivered;
  }

  /** System persona, then recent history, then retrieved context and the question. */
  private async buildMessages(
    sessionId: string,
    message: string,
    locale: Locale,
    mode: AnswerMode,
  ): Promise<DeepseekMessage[]> {
    const docs = await this.buildContextDocs(locale);
    // Ranking picks the most relevant documents, but the cap must stay above
    // the number of content items (profile + projects + experience + blog),
    // otherwise broad questions like "describe all your projects" cannot be
    // answered completely: the dropped items are invisible to the model.
    const selectedDocs = this.rankDocs(message, docs).slice(0, MAX_CONTEXT_DOCS);
    const context = selectedDocs
      .map((doc, index) => `[${index + 1}] ${doc.type}:${doc.id} "${doc.title}"\n${doc.content}`)
      .join('\n\n');
    const history = await this.recentHistory(sessionId);

    return [
      { role: 'system', content: buildChatSystemPrompt(mode) },
      ...history,
      {
        role: 'user',
        content: `Locale: ${locale}\n\nContext:\n${context || 'No context found.'}\n\nQuestion:\n${message}`,
      },
    ];
  }

  /**
   * Requests the answer and, when the model stops because it hit the token cap
   * rather than finishing its thought, asks it to carry on and appends the
   * rest. Without this a long answer reaches the visitor cut mid-sentence,
   * which reads as a broken reply rather than a merely shortened one.
   */
  private async completeAnswer(apiKey: string, messages: DeepseekMessage[]): Promise<string> {
    const conversation = [...messages];
    const parts: string[] = [];

    for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt += 1) {
      const { content, truncated } = await requestCompletion(apiKey, conversation);
      if (content) {
        parts.push(content);
      }
      // Nothing to continue from, or the model finished on its own.
      if (!truncated || !content) {
        break;
      }
      conversation.push({ role: 'assistant', content });
      conversation.push({
        role: 'user',
        content: 'Continue from the exact point where you stopped. Do not repeat anything.',
      });
    }

    const answer = parts.join(' ').trim();
    if (!answer) {
      throw new InternalServerErrorException('Empty AI response');
    }
    return answer;
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
    role: AiChatRole,
    content: string,
    locale: Locale,
  ): Promise<void> {
    await this.chatRepo.save({
      sessionId,
      role,
      content: content.slice(0, 8000),
      locale,
    });
  }

  private async buildContextDocs(locale: Locale): Promise<ContextDoc[]> {
    const [profile, projects, experience, blog] = await Promise.all([
      this.content.getProfile(),
      this.content.getProjects(),
      this.content.getExperience(),
      this.content.getBlogPosts(),
    ]);
    const linkedinLines = await this.linkedin.getProfileContextLines();

    const docs: ContextDoc[] = [
      this.profileToDoc(profile, locale),
      ...projects.map((project) => this.projectToDoc(project, locale)),
      ...experience.map((item) => this.experienceToDoc(item, locale)),
      ...blog.map((post) => this.blogToDoc(post, locale)),
    ];
    if (linkedinLines.length > 0) {
      docs.unshift({
        type: 'profile',
        id: 'linkedin_profile',
        title: 'LinkedIn Profile',
        content: linkedinLines.join('\n'),
      });
    }
    return docs;
  }

  private profileToDoc(profile: Profile, locale: Locale): ContextDoc {
    const name = this.pick(profile.name, locale);
    const title = this.pick(profile.title, locale);
    const location = this.pick(profile.location, locale);
    const about = this.pick(profile.about, locale);
    const email = this.pick(profile.contact.email, locale);
    const phone = profile.contact.phone ? this.pick(profile.contact.phone, locale) : '';
    const content = [
      `Name: ${name}`,
      `Title: ${title}`,
      `Location: ${location}`,
      `About: ${about}`,
      `Email: ${email}`,
      `GitHub: ${profile.contact.github}`,
      `LinkedIn: ${profile.contact.linkedin}`,
      `Phone: ${phone}`,
    ].join('\n');

    return {
      type: 'profile',
      id: 'profile',
      title: name,
      content,
    };
  }

  private projectToDoc(project: Project, locale: Locale): ContextDoc {
    const highlights = this.pickList(project.highlights, locale).join('; ');
    const content = [
      `Title: ${this.pick(project.title, locale)}`,
      `Description: ${this.pick(project.description, locale)}`,
      `Overview: ${this.pick(project.overview, locale)}`,
      `Highlights: ${highlights}`,
      `Tags: ${project.tags.join(', ')}`,
      `URL: ${this.pick(project.url, locale)}`,
      `In development: ${project.inDevelopment ? 'yes' : 'no'}`,
    ].join('\n');

    return {
      type: 'project',
      id: project.id,
      title: this.pick(project.title, locale),
      content,
    };
  }

  private experienceToDoc(item: ExperienceItem, locale: Locale): ContextDoc {
    const highlights = this.pickList(item.highlights, locale).join('; ');
    const summary = item.summary ? this.pick(item.summary, locale) : '';
    const stack = item.stack ? this.pick(item.stack, locale) : '';
    const content = [
      `Company: ${this.pick(item.company, locale)}`,
      `Role: ${this.pick(item.role, locale)}`,
      `Period: ${this.pick(item.period, locale)}`,
      `Description: ${this.pick(item.description, locale)}`,
      `Summary: ${summary}`,
      `Highlights: ${highlights}`,
      `Stack: ${stack}`,
    ].join('\n');

    return {
      type: 'experience',
      id: item.id,
      title: `${this.pick(item.company, locale)} — ${this.pick(item.role, locale)}`,
      content,
    };
  }

  private blogToDoc(post: BlogPost, locale: Locale): ContextDoc {
    const bodyRaw = this.pick(post.body, locale);
    const bodyText = this.extractBlockNoteText(bodyRaw);
    const content = [
      `Title: ${this.pick(post.title, locale)}`,
      `Excerpt: ${this.pick(post.excerpt, locale)}`,
      `Published: ${post.publishedAt}`,
      `Body: ${bodyText}`,
    ].join('\n');

    return {
      type: 'blog',
      id: post.id,
      title: this.pick(post.title, locale),
      content,
    };
  }

  private rankDocs(question: string, docs: ContextDoc[]): ContextDoc[] {
    const terms = this.tokenize(question);
    if (terms.length === 0) {
      return docs;
    }

    const weighted = docs.map((doc) => {
      const haystack = `${doc.title} ${doc.content}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) {
          score += 1;
        }
      }
      return { doc, score };
    });

    return weighted
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.doc.type.localeCompare(b.doc.type);
      })
      .map((item) => item.doc);
  }

  private tokenize(value: string): string[] {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 2);
  }

  private pick(value: LocalizedString, locale: Locale): string {
    return value[locale] ?? value.en;
  }

  private pickList(value: LocalizedList, locale: Locale): string[] {
    return value[locale] ?? value.en;
  }

  private extractBlockNoteText(raw: string): string {
    try {
      const parsed = JSON.parse(raw) as BlockNoteBlock[];
      const lines: string[] = [];
      for (const block of parsed) {
        this.collectBlockText(block, lines);
      }
      return lines.join(' ').replace(/\s+/g, ' ').trim();
    } catch {
      return raw;
    }
  }

  private async recentHistory(sessionId: string): Promise<DeepseekMessage[]> {
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

  private collectBlockText(block: BlockNoteBlock, lines: string[]): void {
    if (Array.isArray(block.content)) {
      const text = block.content
        .map((part) => part.text ?? '')
        .join('')
        .trim();
      if (text) {
        lines.push(text);
      }
    } else if (typeof block.content === 'string' && block.content.trim()) {
      lines.push(block.content.trim());
    }

    if (Array.isArray(block.children)) {
      for (const child of block.children) {
        this.collectBlockText(child, lines);
      }
    }
  }
}

/**
 * Default answer budget for the chat.
 *
 * deepseek-flash is a reasoning model: its chain of thought is billed against
 * this same budget (typically ~1800 tokens before a single word of answer).
 * The old cap of 700 was therefore consumed almost entirely by reasoning and
 * replies arrived empty or cut off. Budget must cover the reasoning pass plus
 * the answer, so it is deliberately generous.
 */
const DEFAULT_MAX_TOKENS = 8000;

/** How many times a truncated answer is continued before giving up. */
const MAX_CONTINUATIONS = 2;

/**
 * How many retrieved documents reach the model. Kept above the total number of
 * content items so a question spanning the whole portfolio is not silently
 * answered from a partial set.
 */
const MAX_CONTEXT_DOCS = 16;

/** Answer budget, configurable so it can be raised without a rebuild. */
function maxTokens(): number {
  const configured = Number(process.env.AI_CHAT_MAX_TOKENS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_TOKENS;
}

/** Persona and rules shared by typed and spoken turns. */
const CHAT_PERSONA_LINES = [
  'You are Grigore Teodor speaking directly to the visitor in first person.',
  'Answer only from the provided context about profile, projects, experience, and blog posts.',
  'For personal questions (name, role, location, contacts) always use profile context and answer as "I".',
  'If the answer is not present in context, clearly say that you do not know based on available data.',
  '',
  'Always finish what you started. Never stop mid-sentence, never trail off, and never leave a',
  'dangling clause. Answer the whole question at whatever length it actually needs.',
  '',
  'Write like a person, not a chatbot. The rules below are the editing standard for every reply:',
  'apply them while you compose, not as a separate pass.',
];

/**
 * Extra rules for a spoken turn. The reply is converted to speech, so markdown
 * is pronounced instead of seen, and a long answer cannot be skimmed the way a
 * written one can.
 */
const VOICE_DELIVERY_RULES = [
  '',
  'This turn is SPOKEN: your reply is converted to speech and played to the visitor.',
  'Answer in one to three short sentences (under about 60 words) of plain conversational',
  'language, the way you would say it on a phone call. No markdown, no bullet points, no',
  'headings, no code, no emoji, and never read a URL or an email address aloud. If a complete',
  'answer would need a long list, give the two or three most important items and offer to go',
  'deeper if the visitor asks.',
];

/**
 * Persona prompt with the vendored humanizer skill baked in.
 *
 * The skill is applied always-on rather than as a second rewriting pass: the
 * model composes in that style directly, which keeps a chat reply to a single
 * round trip and avoids a rewrite pass dropping facts.
 */
function buildChatSystemPrompt(mode: AnswerMode = 'text'): string {
  return [
    ...CHAT_PERSONA_LINES,
    ...(mode === 'voice' ? VOICE_DELIVERY_RULES : []),
    '',
    HUMANIZER_SKILL,
  ].join('\n');
}

/**
 * Reduces a markdown reply to something that survives text-to-speech.
 *
 * The model is told to answer in plain speech for voice turns, but it does not
 * always comply, and a stray `**` or `- ` read literally is worse than the
 * formatting is worth. Falls back to the original when stripping leaves
 * nothing behind.
 */
function toSpokenText(markdown: string): string {
  const plain = markdown
    // Fenced code blocks: keep the body, drop the fences.
    .replace(/```[a-zA-Z0-9]*\n?/g, '')
    // Emphasis, inline code and strikethrough markers.
    .replace(/`{1,3}|[*_~]{1,3}/g, '')
    // Headings and blockquote markers.
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    // Bullet and numbered list markers.
    .replace(/^\s{0,3}(?:[-+*]|\d+\.)\s+/gm, '')
    // Links and images: keep the label, drop the target.
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Horizontal rules.
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, '')
    // Collapse the newlines speech does not need.
    .replace(/\s+/g, ' ')
    .trim();

  return plain || markdown.trim();
}

/** One DeepSeek completion. Reports whether the model ran out of answer budget. */
async function requestCompletion(
  apiKey: string,
  messages: DeepseekMessage[],
): Promise<{ content: string; truncated: boolean }> {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
      messages,
      temperature: 0.4,
      max_tokens: maxTokens(),
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new BadGatewayException(`DeepSeek API error: ${response.status} ${raw}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const choice = payload.choices?.[0];
  // Content can legitimately come back empty when the whole budget went to a
  // reasoning pass. Caller decides what to do with that rather than failing.
  return {
    content: choice?.message?.content?.trim() ?? '',
    truncated: choice?.finish_reason === 'length',
  };
}
