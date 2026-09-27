import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * Which quota a request draws from. Text and voice are tracked separately:
 * three typed questions a day is a sensible guard for a public demo, but it
 * would end a spoken conversation after three sentences, so voice gets its own
 * (larger) budget without loosening the text limit.
 */
export type AiQuotaKind = 'text' | 'voice';

/**
 * Per-IP rate limiter for the public AI chat.
 *
 * Limits each client IP to `limitFor(kind)` requests within ROLLING_WINDOW_MS.
 * Counts are tracked in-process (a `Map`) — no Redis is available in this
 * stack. This means counts reset on a backend restart, which is acceptable for
 * a low-stakes "don't let one visitor drain the DeepSeek budget" guard.
 *
 * Not safe for horizontally-scaled backends (each instance keeps its own
 * counts). This stack runs a single backend container, so that's fine.
 */
@Injectable()
export class AiRateLimiter {
  /** Max questions per IP within the rolling window. */
  static readonly MAX_QUESTIONS = 3;

  /** Max voice turns per IP within the rolling window (overridable by env). */
  static readonly MAX_VOICE_TURNS = 30;

  /** Rolling window length: 24 hours. */
  static readonly ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

  private hits = new Map<AiQuotaKind, Map<string, number[]>>();
  /** Full-map sweep every N calls to evict stale IP entries. */
  private sweepCounter = 0;
  private static readonly SWEEP_EVERY = 100;

  /** Request budget for a quota kind. */
  limitFor(kind: AiQuotaKind): number {
    if (kind === 'text') {
      return AiRateLimiter.MAX_QUESTIONS;
    }
    const configured = Number(process.env.AI_VOICE_MAX_TURNS);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : AiRateLimiter.MAX_VOICE_TURNS;
  }

  /**
   * Record one request from `ip` and throw a 429 if the IP has exceeded its
   * quota. Returns the number of remaining requests for the IP (for the
   * `X-RateLimit-Remaining` header).
   */
  consume(ip: string, kind: AiQuotaKind = 'text'): number {
    const limit = this.limitFor(kind);
    const now = Date.now();
    const recent = this.recent(ip, kind, now);

    if (recent.length >= limit) {
      const retryAfterSec = Math.ceil(
        (recent[0] + AiRateLimiter.ROLLING_WINDOW_MS - now) / 1000,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Question limit reached for today.',
          remaining: 0,
          retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.bucket(kind).set(ip, recent);
    this.maybeSweep();
    return limit - recent.length;
  }

  /** Remaining requests for `ip` without consuming one. */
  remaining(ip: string, kind: AiQuotaKind = 'text'): number {
    const used = this.recent(ip, kind, Date.now()).length;
    return Math.max(0, this.limitFor(kind) - used);
  }

  /** Timestamps for `ip` still inside the rolling window. */
  private recent(ip: string, kind: AiQuotaKind, now: number): number[] {
    const cutoff = now - AiRateLimiter.ROLLING_WINDOW_MS;
    return (this.bucket(kind).get(ip) ?? []).filter((t) => t > cutoff);
  }

  private bucket(kind: AiQuotaKind): Map<string, number[]> {
    let bucket = this.hits.get(kind);
    if (!bucket) {
      bucket = new Map<string, number[]>();
      this.hits.set(kind, bucket);
    }
    return bucket;
  }

  /** Occasionally sweep the maps to evict IPs whose timestamps have all expired. */
  private maybeSweep(): void {
    this.sweepCounter += 1;
    if (this.sweepCounter < AiRateLimiter.SWEEP_EVERY) return;
    this.sweepCounter = 0;

    const cutoff = Date.now() - AiRateLimiter.ROLLING_WINDOW_MS;
    for (const bucket of this.hits.values()) {
      for (const [ip, timestamps] of bucket) {
        const alive = timestamps.filter((t) => t > cutoff);
        if (alive.length === 0) {
          bucket.delete(ip);
        } else if (alive.length < timestamps.length) {
          bucket.set(ip, alive);
        }
      }
    }
  }
}
