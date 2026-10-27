import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ContentService } from '../content/content.service';
import type { LearningSnapshot } from './learning.types';

/** Duolingo's public profile endpoint (unofficial, no SLA). */
const PROFILE_URL = 'https://www.duolingo.com/2017-06-30/users';
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

type DuolingoCourse = { learningLanguage?: string; xp?: number };

type DuolingoUser = {
  streak?: number;
  totalXp?: number;
  fromLanguage?: string;
  courses?: DuolingoCourse[];
};

@Injectable()
export class LearningService implements OnModuleInit {
  private readonly logger = new Logger(LearningService.name);

  constructor(private readonly content: ContentService) {}

  /** Sync on boot, then every six hours. Unconfigured username is a no-op. */
  onModuleInit(): void {
    void this.sync();
    const timer = setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
    timer.unref();
  }

  /** Public payload, or null when there is nothing honest to show. */
  async getPublic(): Promise<LearningSnapshot | null> {
    const snapshot = await this.content.readKey<LearningSnapshot>('learning');
    return snapshot?.available ? snapshot : null;
  }

  /** Records a self-assessed level, leaving the synced numbers untouched. */
  async setLevel(level: string, since?: string): Promise<LearningSnapshot> {
    const current = await this.content.readKey<LearningSnapshot>('learning');
    const now = new Date().toISOString();
    const next: LearningSnapshot = {
      ...(current ?? { available: false, source: 'duolingo' as const, syncedAt: now }),
      level: level.trim().toUpperCase().slice(0, 2),
      levelSince: since?.trim() || current?.levelSince || now.slice(0, 10),
    };
    await this.content.writeKey('learning', next);
    return next;
  }

  private async sync(): Promise<void> {
    const username = process.env.DUOLINGO_USERNAME?.trim();
    if (!username) {
      return;
    }

    try {
      const user = await this.fetchProfile(username);
      const previous = await this.content.readKey<LearningSnapshot>('learning');
      await this.content.writeKey('learning', this.toSnapshot(user, previous));
      this.logger.log(`Duolingo sync ok for "${username}"`);
    } catch (error) {
      this.logger.warn(`Duolingo sync failed for "${username}": ${(error as Error).message}`);
    }
  }

  private async fetchProfile(username: string): Promise<DuolingoUser> {
    const res = await fetch(`${PROFILE_URL}?username=${encodeURIComponent(username)}`, {
      headers: { 'User-Agent': 'grig-teo.space learning widget (+https://grig-teo.space)' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as { users?: DuolingoUser[] };
    const user = body.users?.[0];
    if (!user) {
      throw new Error('no user in response');
    }
    return user;
  }

  /** Maps a Duolingo profile onto our snapshot, preserving a declared level. */
  private toSnapshot(user: DuolingoUser, previous: LearningSnapshot | null): LearningSnapshot {
    const spanish = user.courses?.find((course) => course.learningLanguage === 'es');
    return {
      available: Boolean(spanish),
      source: 'duolingo',
      streak: user.streak ?? 0,
      xp: spanish?.xp,
      totalXp: user.totalXp,
      fromLanguage: user.fromLanguage,
      level: previous?.level,
      levelSince: previous?.levelSince,
      syncedAt: new Date().toISOString(),
    };
  }
}
