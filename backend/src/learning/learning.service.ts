import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ContentService } from '../content/content.service';
import type { LearningCourse, LearningSnapshot } from './learning.types';

/** Duolingo's public profile endpoint (unofficial, no SLA). */
const PROFILE_URL = 'https://www.duolingo.com/2017-06-30/users';
/** Hourly keeps the chip close to current while staying polite: 24 requests a day. */
const SYNC_INTERVAL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

type DuolingoCourse = {
  learningLanguage?: string;
  title?: string;
  xp?: number;
  fromLanguage?: string;
};

type DuolingoUser = {
  streak?: number;
  totalXp?: number;
  fromLanguage?: string;
  /** Unix seconds. */
  creationDate?: number;
  courses?: DuolingoCourse[];
};

/** The pre-multi-course shape, still in the database on first deploy. */
type LegacySnapshot = { xp?: number; createdAt?: string };

@Injectable()
export class LearningService implements OnModuleInit {
  private readonly logger = new Logger(LearningService.name);

  constructor(private readonly content: ContentService) {}

  /** Sync on boot, then hourly. Unconfigured username is a no-op. */
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

  /** Records a self-assessed level for one course, leaving the XP untouched. */
  async setLevel(code: string, level: string, since?: string): Promise<LearningSnapshot> {
    const current = await this.content.readKey<LearningSnapshot>('learning');
    if (!current?.courses?.length) {
      throw new BadRequestException('No learning snapshot yet: wait for the first Duolingo sync');
    }
    const target = current.courses.find((course) => course.code === code);
    if (!target) {
      throw new BadRequestException(`Course "${code}" is not in the snapshot`);
    }

    const normalised = level.trim().toUpperCase().slice(0, 2);
    const declared = since?.trim() || target.levelSince || new Date().toISOString().slice(0, 10);
    const courses = current.courses.map((course) =>
      course.code === code ? { ...course, level: normalised, levelSince: declared } : course,
    );

    const next: LearningSnapshot = { ...current, courses };
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
      this.logger.log(`Duolingo sync ok for "${username}" (${user.courses?.length ?? 0} courses)`);
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

  /** Maps a Duolingo profile onto our snapshot, preserving declared levels. */
  private toSnapshot(user: DuolingoUser, previous: LearningSnapshot | null): LearningSnapshot {
    const courses = (user.courses ?? [])
      .filter((course) => typeof course.learningLanguage === 'string')
      .map((course) => this.toCourse(course, previous));

    return {
      available: courses.length > 0,
      source: 'duolingo',
      streak: user.streak ?? 0,
      totalXp: user.totalXp,
      fromLanguage: user.fromLanguage,
      createdAt: user.creationDate
        ? new Date(user.creationDate * 1000).toISOString()
        : previous?.createdAt,
      courses,
      syncedAt: new Date().toISOString(),
    };
  }

  private toCourse(course: DuolingoCourse, previous: LearningSnapshot | null): LearningCourse {
    const code = String(course.learningLanguage);
    const prior = previous?.courses?.find((entry) => entry.code === code);
    return {
      code,
      title: course.title ?? code.toUpperCase(),
      xp: course.xp ?? 0,
      fromLanguage: course.fromLanguage,
      firstSeenAt: prior?.firstSeenAt ?? this.firstSeenAt(previous, code),
      level: prior?.level,
      levelSince: prior?.levelSince,
    };
  }

  /**
   * Start date for a course we have not recorded before. A course added today
   * starts today; the exception is the one-time migration from the single
   * course shape, where the existing Spanish course began with the account.
   */
  private firstSeenAt(previous: LearningSnapshot | null, code: string): string {
    const legacy = previous as (LearningSnapshot & LegacySnapshot) | null;
    if (legacy?.xp !== undefined && !previous?.courses && code === 'es' && previous?.createdAt) {
      return previous.createdAt;
    }
    return new Date().toISOString();
  }
}
