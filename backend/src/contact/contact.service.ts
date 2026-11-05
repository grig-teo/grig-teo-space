import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { ContactMessage } from '../entities/contact-message.entity';

export type ContactInput = {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  description?: unknown;
  budget?: unknown;
  timeline?: unknown;
  source?: unknown;
  /** Honeypot: real visitors never see or fill this. */
  website?: unknown;
  /** Client timestamp of form mount (ms), used as a fill-time check. */
  startedAt?: unknown;
};

export type ContactAccepted = { ok: true };

const LIMITS = {
  name: { min: 2, max: 120 },
  email: 200,
  company: 200,
  description: { min: 20, max: 5000 },
  budget: 120,
  timeline: 120,
} as const;

/** A bot fills the form in well under a second. */
const MIN_FILL_MS = 1200;
/** More links than this in a first message reads as spam. */
const MAX_LINKS = 3;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = (value: unknown, max = 500): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @InjectRepository(ContactMessage)
    private readonly repo: Repository<ContactMessage>,
  ) {}

  /**
   * Records an inquiry. Bot-shaped submissions are accepted silently so a
   * script cannot tell it was filtered, but nothing is stored or sent.
   */
  async submit(input: ContactInput, ip: string, userAgent?: string): Promise<ContactAccepted> {
    if (str(input.website)) {
      return { ok: true };
    }
    if (this.tooFast(input.startedAt)) {
      return { ok: true };
    }

    const name = this.required(input.name, 'name', LIMITS.name.min, LIMITS.name.max);
    const email = this.requiredEmail(input.email);
    const description = this.required(
      input.description,
      'description',
      LIMITS.description.min,
      LIMITS.description.max,
    );
    if (this.countLinks(description) > MAX_LINKS) {
      throw new BadRequestException('description contains too many links');
    }

    const message = this.repo.create({
      name,
      email,
      company: str(input.company, LIMITS.company) || undefined,
      description,
      budget: str(input.budget, LIMITS.budget) || undefined,
      timeline: str(input.timeline, LIMITS.timeline) || undefined,
      source: str(input.source, 40) || 'contact',
      ipHash: this.hashIp(ip),
      userAgent: userAgent?.slice(0, 300),
      status: 'new',
    });
    const saved = await this.repo.save(message);
    this.logger.log(`Contact inquiry ${saved.id} from ${email}`);

    // Best effort: a notification failure must never lose the inquiry.
    void this.notify(saved);
    return { ok: true };
  }

  /** Admin view, newest first. */
  async list(limit = 50): Promise<ContactMessage[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: Math.min(limit, 200) });
  }

  private tooFast(startedAt: unknown): boolean {
    const started = Number(startedAt);
    if (!Number.isFinite(started) || started <= 0) return false;
    const elapsed = Date.now() - started;
    return elapsed >= 0 && elapsed < MIN_FILL_MS;
  }

  private required(value: unknown, field: string, min: number, max: number): string {
    const text = str(value, max);
    if (text.length < min) {
      throw new BadRequestException(`${field} must be at least ${min} characters`);
    }
    return text;
  }

  private requiredEmail(value: unknown): string {
    const email = str(value, LIMITS.email).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      throw new BadRequestException('email is not valid');
    }
    return email;
  }

  private countLinks(text: string): number {
    return (text.match(/https?:\/\//gi) ?? []).length;
  }

  /** Salted so the same IP is linkable over time but not reversible. */
  private hashIp(ip: string): string {
    const salt = process.env.CONTACT_IP_SALT ?? process.env.JWT_SECRET ?? 'grig-teo';
    return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
  }

  /** Sends the inquiry to Telegram; unconfigured means silently skipped. */
  private async notify(message: ContactMessage): Promise<void> {
    const token = process.env.CONTACT_TELEGRAM_BOT_TOKEN ?? process.env.DEV_TELEGRAM_BOT_TOKEN;
    const chatId = process.env.CONTACT_TELEGRAM_CHAT_ID ?? process.env.DEV_TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      this.logger.warn('Contact notification skipped: no Telegram token/chat configured');
      return;
    }

    const lines = [
      'New project inquiry',
      `Name: ${message.name}`,
      `Email: ${message.email}`,
      message.company ? `Company: ${message.company}` : '',
      message.budget ? `Budget: ${message.budget}` : '',
      message.timeline ? `Timeline: ${message.timeline}` : '',
      '',
      message.description,
    ].filter(Boolean);

    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: lines.join('\n').slice(0, 4000) }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`Contact notification failed: ${(error as Error).message}`);
    }
  }
}
