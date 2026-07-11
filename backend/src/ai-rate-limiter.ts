import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * Per-IP rate limiter for the public AI chat.
 *
 * Limits each client IP to MAX_QUESTIONS within ROLLING_WINDOW_MS. The count
 * is tracked in-process (a `Map`) — no Redis is available in this stack.
 * This means counts reset on a backend restart, which is acceptable for a
 * low-stakes "don't let one visitor drain the DeepSeek budget" guard.
 *
 * Not safe for horizontally-scaled backends (each instance keeps its own
 * counts). This stack runs a single backend container, so that's fine.
 */
@Injectable()
export class AiRateLimiter {
  /** Max questions per IP within the rolling window. */
  static readonly MAX_QUESTIONS = 3;

  /** Rolling window length: 24 hours. */
  static readonly ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

  private hits = new Map<string, number[]>();

  /**
   * Record one question from `ip` and throw a 429 if the IP has exceeded its
   * quota. Returns the number of remaining questions for the IP (for the
   * `X-RateLimit-Remaining` header).
   */
  consume(ip: string): number {
    const now = Date.now();
    const cutoff = now - AiRateLimiter.ROLLING_WINDOW_MS;

    // Drop timestamps older than the window.
    const recent = (this.hits.get(ip) ?? []).filter((t) => t > cutoff);

    if (recent.length >= AiRateLimiter.MAX_QUESTIONS) {
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
    this.hits.set(ip, recent);

    return AiRateLimiter.MAX_QUESTIONS - recent.length;
  }

  /** Remaining questions for `ip` without consuming one. */
  remaining(ip: string): number {
    const now = Date.now();
    const cutoff = now - AiRateLimiter.ROLLING_WINDOW_MS;
    const recent = (this.hits.get(ip) ?? []).filter((t) => t > cutoff);
    return Math.max(0, AiRateLimiter.MAX_QUESTIONS - recent.length);
  }
}
