import { Injectable } from '@nestjs/common';

interface AttemptRecord {
  /** Consecutive failures since the last success (or since tracking began). */
  count: number;
  /** Epoch ms until which this IP is banned, or undefined if not banned. */
  bannedUntil?: number;
}

/**
 * In-process tracker of consecutive authentication failures per client IP.
 *
 * After {@link LoginAttemptTracker.BAN_THRESHOLD} consecutive failures the IP
 * is banned for {@link LoginAttemptTracker.BAN_DURATION_MS}. A successful
 * authentication clears the counter immediately.
 *
 * Storage is in-process (`Map`) — counts reset on a backend restart, matching
 * the precedent set by `AiRateLimiter`. Acceptable for a single-instance
 * deployment (this stack runs one backend container).
 */
@Injectable()
export class LoginAttemptTracker {
  /** Consecutive failures before a temporary ban is applied. */
  static readonly BAN_THRESHOLD = 10;

  /** How long (ms) an IP stays banned after hitting the threshold. */
  static readonly BAN_DURATION_MS = 15 * 60 * 1000;

  private records = new Map<string, AttemptRecord>();

  /** Returns the remaining ban time in ms, or 0 if the IP is not banned. */
  getBanRemainingMs(ip: string): number {
    const record = this.records.get(ip);
    if (!record?.bannedUntil) return 0;
    const remaining = record.bannedUntil - Date.now();
    if (remaining <= 0) {
      this.records.delete(ip);
      return 0;
    }
    return remaining;
  }

  /** Record a failed attempt, triggering a ban when the threshold is reached. */
  recordFailure(ip: string): void {
    const record = this.records.get(ip) ?? { count: 0 };
    record.count += 1;
    if (record.count >= LoginAttemptTracker.BAN_THRESHOLD && !record.bannedUntil) {
      record.bannedUntil = Date.now() + LoginAttemptTracker.BAN_DURATION_MS;
    }
    this.records.set(ip, record);
  }

  /** Clear the failure counter for an IP (call on successful authentication). */
  recordSuccess(ip: string): void {
    this.records.delete(ip);
  }
}
