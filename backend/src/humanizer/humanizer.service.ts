import { Injectable, Logger } from '@nestjs/common';
import type { ExperienceItem, Locale, Profile, Project } from '../types';
import {
  applyExperienceRewrites,
  applyProfileRewrites,
  applyProjectRewrites,
  chunkTasks,
  collectExperienceTasks,
  collectProfileTasks,
  collectProjectTasks,
  HUMANIZER_LOCALES,
  type Rewrites,
  type TextTask,
} from './humanizer.fields';
import { HUMANIZER_SKILL } from './humanizer.skill';

/** Humanizing a whole locale is slow; bound it so a save cannot hang forever. */
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Rewrites stored content through the vendored `humanizer` skill before it is
 * persisted, so every write to the content API produces prose that reads like
 * the author rather than a model.
 *
 * The skill is a Markdown instruction document, not executable code: it is sent
 * verbatim as the system prompt and the fields are batched by locale.
 *
 * Failure is never fatal. If the model is unavailable, times out, or returns
 * unusable JSON, the affected fields keep their original text and the save
 * proceeds, so a model outage can never lose content.
 */
@Injectable()
export class HumanizerService {
  private readonly logger = new Logger(HumanizerService.name);

  /** Humanization needs an API key, and can be switched off with HUMANIZER_ENABLED=false. */
  isEnabled(): boolean {
    if (process.env.HUMANIZER_ENABLED?.trim().toLowerCase() === 'false') {
      return false;
    }
    return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  }

  /** Rewrites the prose fields of a profile, skipping text that did not change. */
  async humanizeProfile(next: Profile, prev: Profile | null): Promise<Profile> {
    if (!this.isEnabled()) {
      return next;
    }
    const rewrites = await this.run(collectProfileTasks(next, prev));
    return applyProfileRewrites(next, rewrites);
  }

  /** Rewrites the prose fields of every experience entry. */
  async humanizeExperience(
    next: ExperienceItem[],
    prev: ExperienceItem[] | null,
  ): Promise<ExperienceItem[]> {
    if (!this.isEnabled()) {
      return next;
    }
    const rewrites = await this.run(collectExperienceTasks(next, prev));
    return applyExperienceRewrites(next, rewrites);
  }

  /** Rewrites the prose fields of every project. */
  async humanizeProjects(next: Project[], prev: Project[] | null): Promise<Project[]> {
    if (!this.isEnabled()) {
      return next;
    }
    const rewrites = await this.run(collectProjectTasks(next, prev));
    return applyProjectRewrites(next, rewrites);
  }

  /** Runs every locale and batch, collecting whatever the model managed to rewrite. */
  private async run(tasks: TextTask[]): Promise<Rewrites> {
    const rewrites: Rewrites = new Map();
    if (tasks.length === 0) {
      return rewrites;
    }
    this.logger.log(`Humanizing ${tasks.length} field(s)`);

    for (const locale of HUMANIZER_LOCALES) {
      const forLocale = tasks.filter((task) => task.locale === locale);
      for (const chunk of chunkTasks(forLocale)) {
        const result = await this.runChunk(locale, chunk);
        for (const [key, value] of result) {
          rewrites.set(key, value);
        }
      }
    }

    this.logger.log(`Humanizer rewrote ${rewrites.size} of ${tasks.length} field(s)`);
    return rewrites;
  }

  /** A failing batch is reported and skipped so the original text survives. */
  private async runChunk(locale: Locale, chunk: TextTask[]): Promise<Rewrites> {
    try {
      const raw = await this.callModel(locale, chunk);
      return parseRewrites(raw, chunk);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Humanizer kept ${chunk.length} field(s) unchanged for ${locale}: ${reason}`);
      return new Map();
    }
  }

  private async callModel(locale: Locale, chunk: TextTask[]): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not set');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserPrompt(locale, chunk) },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty humanizer response');
      }
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The skill body plus the task-specific contract for stored content. */
function buildSystemPrompt(): string {
  return [
    HUMANIZER_SKILL,
    '',
    '## Applied task: rewrite stored website content',
    '',
    'You are editing content that is already published. Apply the patterns above, then obey these rules:',
    '',
    '- Return ONLY a JSON object. No commentary, no markdown fences.',
    '- Use exactly the same keys as the input, each mapped to the rewritten string.',
    '- Preserve every fact: numbers, dates, names, companies, technology and product names, versions and URLs. Invent nothing and drop nothing.',
    '- Do not translate. Rewrite each value in the language it is already written in.',
    '- Never alter text inside guillemets, code identifiers, or technology names.',
    '- Remove em dashes and en dashes, replacing them with a comma, colon, period, or a restructured sentence.',
    '- Register: professional portfolio. Credible and natural, never chatty or salesy.',
    '- If a value is already clean, return it unchanged.',
  ].join('\n');
}

function buildUserPrompt(locale: Locale, chunk: TextTask[]): string {
  const payload: Record<string, string> = {};
  for (const task of chunk) {
    payload[task.key] = task.text;
  }
  return [
    `Language: ${locale}`,
    '',
    'Rewrite the values of this JSON object and return the object:',
    '',
    JSON.stringify(payload, null, 2),
  ].join('\n');
}

/** Keeps only usable rewrites; a missing or unchanged key falls back to the original. */
function parseRewrites(raw: string, chunk: TextTask[]): Rewrites {
  const parsed = extractJsonObject(raw);
  const rewrites: Rewrites = new Map();
  if (!parsed) {
    return rewrites;
  }

  for (const task of chunk) {
    const value = parsed[task.key];
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed && trimmed !== task.text) {
      rewrites.set(task.key, trimmed);
    }
  }
  return rewrites;
}

/** Models sometimes wrap JSON in prose or fences; recover the outer object. */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
