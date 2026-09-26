import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Tiny JSON-backed key/value store for scheduler memory.
 *
 * The scheduler previously kept "did I already send today's digest?" only in
 * memory. Every container restart during the digest hour therefore sent it
 * again — which is exactly what happened when a deploy recreated the bot
 * three times inside that hour. Persisting the marker to a mounted volume
 * makes once-per-day mean once per day, regardless of restarts.
 */
export class JobState {
  private cache: Record<string, string> | null = null;

  constructor(private readonly path: string) {}

  read(): Record<string, string> {
    if (this.cache) {
      return this.cache;
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      this.cache = parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
    } catch {
      // Missing or corrupt state simply means "nothing sent yet".
      this.cache = {};
    }
    return this.cache;
  }

  get(key: string): string | undefined {
    return this.read()[key];
  }

  /** Merges `patch` into the stored state. Never throws — state is best effort. */
  write(patch: Record<string, string>): void {
    const next = { ...this.read(), ...patch };
    this.cache = next;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(next), 'utf8');
    } catch {
      // Losing the marker risks a duplicate send, but must not kill the bot.
    }
  }
}
