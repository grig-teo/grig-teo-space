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
import { LinkedInService } from './linkedin.service';
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

@Injectable()
export class AiService {
  private static readonly maxHistoryMessages = 100;

  constructor(
    private readonly content: ContentService,
    private readonly linkedin: LinkedInService,
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

  async answerQuestion(message: string, locale: Locale, sessionId: string): Promise<string> {
    const normalizedSessionId = this.normalizeSessionId(sessionId);
    await this.saveChatMessage(normalizedSessionId, 'user', message, locale);

    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('AI chat is not configured yet');
    }

    const docs = await this.buildContextDocs(locale);
    const selectedDocs = this.rankDocs(message, docs).slice(0, 8);
    const context = selectedDocs
      .map((doc, index) => `[${index + 1}] ${doc.type}:${doc.id} "${doc.title}"\n${doc.content}`)
      .join('\n\n');

    // Load recent conversation history so follow-up questions work (e.g.
    // "what about the second one?"). The current user message is excluded
    // — it appears separately as the final message below.
    const history: DeepseekMessage[] = await this.recentHistory(normalizedSessionId);

    const messages: DeepseekMessage[] = [
      {
        role: 'system',
        content:
          'You are Grigore Teodor speaking directly to the visitor in first person. ' +
          'Answer only from the provided context about profile, projects, experience, and blog posts. ' +
          'For personal questions (for example: name, role, location, contacts), always use profile context and answer as "I". ' +
          'If the answer is not present in context, clearly say that you do not know based on available data. ' +
          'Keep responses concise, factual, and avoid inventing details.',
      },
      ...history,
      {
        role: 'user',
        content: `Locale: ${locale}\n\nContext:\n${context || 'No context found.'}\n\nQuestion:\n${message}`,
      },
    ];

    const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 700,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new BadGatewayException(`DeepSeek API error: ${response.status} ${raw}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new InternalServerErrorException('Empty AI response');
    }

    await this.saveChatMessage(normalizedSessionId, 'assistant', answer, locale);
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
