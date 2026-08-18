import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Not, Repository } from 'typeorm';
import { ContentKey, SiteContent } from '../entities/site-content.entity';
import {
  HealthMetric,
  HEALTH_METRICS,
  HealthReading,
  HealthSource,
} from '../entities/health-reading.entity';
import { HealthNote, HealthNoteSource } from '../entities/health-note.entity';
import { HealthTip } from '../entities/health-tip.entity';
import { SleepSession } from '../entities/sleep-session.entity';
import { StorageService } from '../storage/storage.service';
import { WeatherService } from '../weather/weather.service';

// --- Public exposure configuration ---------------------------------------

export type MetricPublicConfig = {
  /** Whether this metric is exposed on the public health page. */
  show: boolean;
  /** Optional custom label override (defaults to the metric's display name). */
  label?: string;
};

export type HealthPublicConfig = {
  /** Master switch for the public health page. */
  enabled: boolean;
  /** Display name shown at the top of the public health page. */
  displayName: string;
  /** How many recent days of data to expose publicly. */
  windowDays: number;
  /** Per-metric visibility settings. */
  metrics: Partial<Record<HealthMetric, MetricPublicConfig>>;
};

const DEFAULT_PUBLIC_CONFIG: HealthPublicConfig = {
  enabled: false,
  displayName: 'Health',
  windowDays: 7,
  metrics: {},
};

// --- DTOs ----------------------------------------------------------------

export type IncomingReading = {
  metric: HealthMetric;
  value: number;
  unit?: string | null;
  recordedAt: string;
  source?: HealthSource;
  raw?: Record<string, unknown>;
};

export type IncomingNote = {
  content: string;
  mood?: string | null;
  source?: HealthNoteSource;
  recordedAt?: string;
  /** Private-bucket key from POST /health/notes/media. */
  mediaKey?: string;
  /** 'photo' | 'video' when mediaKey is set. */
  mediaType?: string;
};

/** One night's sleep as uploaded by the iOS app (parsed ring frame). */
export type IncomingSleepSession = {
  start: string;
  end: string;
  deepMin?: number;
  remMin?: number;
  lightMin?: number;
  awakeMin?: number;
  score?: number;
  raw?: Record<string, unknown>;
};

export type SleepSessionView = {
  startedAt: string;
  endedAt: string;
  durationMin: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
  score: number;
};

export type SleepOverview = {
  days: number;
  sessions: SleepSessionView[];
  avgScore: number | null;
  avgDurationMin: number | null;
  /** Bedtime spread across the window, as local minutes after midnight. */
  bedtimeRange: { earliestMin: number; latestMin: number } | null;
  /** Accumulated shortfall vs the 8h goal over the window, in minutes. */
  debtMin: number;
};

export type RecoveryScore = {
  score: number;
  label: string;
  generatedAt: string;
  components: {
    sleepScore: number | null;
    hrv: { current: number | null; baseline: number | null };
    restingHr: { current: number | null; baseline: number | null };
  };
  /** Human-readable deviation warnings (HRV drop, resting-HR rise). */
  alerts: string[];
};

/** Daily goal + streak state for the iOS Profile streak card. */
export type ActivityInsights = {
  goalSteps: number;
  todaySteps: number;
  todayKm: number;
  goalReached: boolean;
  streakDays: number;
  bestStreakDays: number;
};

/** LLM-written weekly summary with the numbers behind it. */
export type WeeklyDigest = {
  text: string;
  generatedAt: string;
  stats: {
    steps: number;
    km: number;
    avgStress: number | null;
    avgSleepScore: number | null;
    avgSleepH: number | null;
    bestDay: { date: string; steps: number } | null;
    prevSteps: number;
    prevKm: number;
    prevAvgSleepScore: number | null;
  };
};

/** One auto-detected activity window (HR spike + step rate). */
export type DetectedActivity = {
  start: string;
  end: string;
  steps: number;
  km: number;
  avgHr: number | null;
  peakHr: number | null;
};

export type YearReview = {
  daysWithData: number;
  totalSteps: number;
  totalKm: number;
  bestStreakDays: number;
  bestDay: { date: string; steps: number } | null;
  avgSleepScore: number | null;
  avgSleepH: number | null;
  longestActivityMin: number | null;
};

/** Daily step goal driving the streak. */
const STEP_GOAL = 8000;

export type MetricSeriesPoint = {
  recordedAt: string;
  value: number;
};

/** One bucket in an hourly series: the local clock hour and its averaged value. */
export type HourlyBucket = {
  /** Hour of day 0–23 (local server time). */
  hour: number;
  /** Mean of all readings in the bucket, or null when the hour had none. */
  value: number | null;
  /** Number of readings averaged into the bucket. */
  count: number;
  /** ISO timestamp of the most recent reading in the bucket, or null when
   *  the hour had none — shown by the iOS chart as the collection time. */
  latestAt: string | null;
};

export type HourlySeries = {
  metric: HealthMetric;
  unit: string | null;
  buckets: HourlyBucket[];
};

/** Rolling-window time series for one metric (iOS metric detail charts). */
export type MetricSeries = {
  metric: HealthMetric;
  unit: string | null;
  windowDays: number;
  summary: MetricSummary;
  points: MetricSeriesPoint[];
};

export type MetricSummary = {
  metric: HealthMetric;
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  latest: MetricSeriesPoint | null;
};

export type HealthAlert = {
  metric: HealthMetric;
  level: 'warning' | 'critical';
  message: string;
  value: number;
  recordedAt: string;
};

export type HealthSummary = {
  windowDays: number;
  from: string;
  to: string;
  metrics: MetricSummary[];
  notesCount: number;
  alerts: HealthAlert[];
};

export type PublicMetricPayload = {
  metric: HealthMetric;
  label: string;
  unit: string | null;
  summary: MetricSummary;
  series: MetricSeriesPoint[];
};

export type PublicHealthPayload = {
  enabled: boolean;
  displayName: string;
  windowDays: number;
  metrics: PublicMetricPayload[];
  now: PublicNowStatus | null;
};

/** Coarse live activity for the landing page badge. */
export type PublicNowStatus = {
  status: 'walking' | 'working_out' | 'asleep' | 'resting';
};

export type HealthOverview = {
  from: string;
  to: string;
  metrics: Array<MetricSummary & { series: MetricSeriesPoint[] }>;
  notes: Array<{
    id: string;
    content: string;
    mood: string | null;
    source: string;
    recordedAt: string;
  }>;
  alerts: HealthAlert[];
};

// --- Default unit per metric ---------------------------------------------

const DEFAULT_UNITS: Record<HealthMetric, string> = {
  heart_rate: 'bpm',
  spo2: '%',
  steps: 'steps',
  calories: 'kcal',
  distance_km: 'km',
  stress: 'index',
  hrv: 'ms',
  sleep_duration_h: 'h',
  sleep_quality: '%',
};

export const METRIC_LABELS: Record<HealthMetric, string> = {
  heart_rate: 'Heart Rate',
  spo2: 'Blood Oxygen (SpO₂)',
  steps: 'Steps',
  calories: 'Calories',
  distance_km: 'Distance',
  stress: 'Stress',
  hrv: 'Heart Rate Variability',
  sleep_duration_h: 'Sleep Duration',
  sleep_quality: 'Sleep Quality',
};

// Anomaly thresholds. A reading outside these bounds in the recent window
// produces an alert surfaced to the admin dashboard and the Telegram bot.
const ANOMALY_RULES: Array<{
  metric: HealthMetric;
  level: 'warning' | 'critical';
  message: string;
  test: (value: number) => boolean;
}> = [
  {
    metric: 'spo2',
    level: 'critical',
    message: 'Low blood oxygen (SpO₂ below 90%)',
    test: (value) => value < 90,
  },
  {
    metric: 'heart_rate',
    level: 'warning',
    message: 'Elevated heart rate (above 120 bpm at rest)',
    test: (value) => value > 120,
  },
  {
    metric: 'heart_rate',
    level: 'warning',
    message: 'Low heart rate (below 40 bpm)',
    test: (value) => value < 40,
  },
];

const MAX_READINGS_PER_REQUEST = 2000;
const MAX_SERIES_POINTS = 1000;

// --- Hourly tip (DeepSeek) --------------------------------------------------

/** How recent the latest reading must be to generate a tip at all. */
const TIP_STALENESS_HOURS = 3;
/** Window of readings fed to the LLM as the "right now" context. */
const TIP_WINDOW_HOURS = 1;
/** A generated tip is reused (served to every consumer) for this long before
 *  a fresh one is generated. Caps LLM calls + history rows at one per hour. */
const TIP_CACHE_MS = 60 * 60 * 1000;
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';

const TIP_SYSTEM_PROMPT =
  'You are a friendly, practical health coach for the owner of a smart ring. ' +
  'You receive their latest ring metrics (heart rate, SpO2, steps, calories, ' +
  'distance, stress, HRV, sleep) from the past hour.\n\n' +
  'Give exactly ONE short, actionable thing they can do right now to improve ' +
  'their wellbeing, and weave the specific numbers your advice is based on ' +
  'into the tip — e.g. "Your heart rate averaged 82 bpm and you only walked ' +
  '300 steps this hour, so take a short walk now."\n\n' +
  'Rules:\n' +
  '- 2 to 3 sentences, under 70 words total.\n' +
  '- Plain text only. No markdown, no emoji, no bullet points.\n' +
  '- Always include the one or two most relevant numbers from the data in ' +
  'the tip itself, so the reader sees what it is based on.\n' +
  '- Do not diagnose or give medical advice. If a value looks concerning, ' +
  'briefly suggest they check with a doctor.';

const DIGEST_SYSTEM_PROMPT =
  'You are a friendly health coach writing a weekly digest for the owner of ' +
  'a smart ring. You receive this week\'s totals and averages plus the ' +
  'previous week\'s for comparison.\n\n' +
  'Rules:\n' +
  '- 3 to 4 sentences, under 90 words. Plain text, no markdown, no emoji.\n' +
  '- Compare this week with last week using the actual numbers (steps, km, ' +
  'sleep score) — say whether each went up or down.\n' +
  '- Mention the best day by name if one is given.\n' +
  '- End with one concrete suggestion for next week.';

/** Default body stats (used until the user sets their own). */
const DEFAULT_BODY_STATS = { heightCm: 185, weightKg: 94 };

type HourlyTipResult = {
  tip: string | null;
  generatedAt: string;
  skippedReason?: string;
};

/** Body stats stored as a single JSONB row (key 'body_stats' in site_content). */
export type BodyStats = {
  heightCm: number;
  weightKg: number;
  /** Read-only, computed from height + weight. */
  bmi: number;
  updatedAt: string;
};

export type TipListItem = {
  id: string;
  content: string;
  generatedAt: string;
};

export type TipListPage = {
  items: TipListItem[];
  total: number;
  hasMore: boolean;
};

type GlmMessage = {
  role: 'system' | 'user';
  content: string;
};

@Injectable()
export class HealthService {
  constructor(
    @InjectRepository(HealthReading)
    private readonly readingRepo: Repository<HealthReading>,
    @InjectRepository(HealthNote)
    private readonly noteRepo: Repository<HealthNote>,
    @InjectRepository(SiteContent)
    private readonly contentRepo: Repository<SiteContent>,
    @InjectRepository(HealthTip)
    private readonly tipRepo: Repository<HealthTip>,
    @InjectRepository(SleepSession)
    private readonly sleepRepo: Repository<SleepSession>,
    private readonly weather: WeatherService,
    private readonly storage: StorageService,
  ) {}

  // --- Ingest -------------------------------------------------------------

  async addReadings(readings: IncomingReading[]): Promise<{ inserted: number }> {
    if (readings.length > MAX_READINGS_PER_REQUEST) {
      throw new BadRequestException(`Too many readings (max ${MAX_READINGS_PER_REQUEST})`);
    }
    // Skip invalid rows instead of failing the whole batch — one unknown
    // metric (e.g. from an older app build) must not block the rest.
    const rows = readings
      .map((reading) => this.toReadingEntityOrNull(reading))
      .filter((row): row is HealthReading => row !== null);
    if (rows.length === 0) {
      return { inserted: 0 };
    }
    // Collapse duplicate (metric, recorded_at) keys inside the batch —
    // Postgres rejects ON CONFLICT DO UPDATE when one command touches the
    // same row twice.
    const byKey = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      byKey.set(`${row.metric}|${row.recordedAt.toISOString()}`, row);
    }
    const deduped = [...byKey.values()];
    // Upsert on (metric, recorded_at): the ring's history sync resends the
    // same 15-minute slots with fresher values — replace, never duplicate.
    const values = deduped.map(({ metric, value, unit, recordedAt, source, raw }) => ({
      metric,
      value,
      unit,
      recordedAt,
      source,
      raw: (raw ?? null) as any,
    }));
    await this.readingRepo
      .createQueryBuilder()
      .insert()
      .into(HealthReading)
      .values(values as any)
      .orUpdate(['value', 'unit', 'raw', 'source'], ['metric', 'recorded_at'])
      .execute();
    return { inserted: deduped.length };
  }

  async addNote(note: IncomingNote): Promise<HealthNote> {
    const content = note.content?.trim();
    if (!content) {
      throw new RangeError('Note content must not be empty');
    }
    const saved = await this.noteRepo.save({
      content: content.slice(0, 4000),
      mood: note.mood?.trim().slice(0, 16) ?? null,
      source: note.source ?? 'manual',
      mediaKey: note.mediaKey?.trim().slice(0, 128) || null,
      mediaType: note.mediaType === 'video' ? 'video' : note.mediaType === 'photo' ? 'photo' : null,
      recordedAt: this.parseDate(note.recordedAt) ?? new Date(),
    });
    // Describe attached photos with the on-VPS vision model in the
    // background — the note save must not wait on a ~30–180s CPU inference.
    if (saved.mediaType === 'photo' && saved.mediaKey) {
      void this.describeNoteMedia(saved.id, saved.mediaKey);
    }
    return saved;
  }

  /**
   * Describes a note's photo with the local vision model (Ollama, default
   * qwen2.5vl:7b) and stores the one-sentence result on the note — the tip
   * generator then sees "ate pizza" [photo: a pepperoni pizza slice]
   * instead of a bare "[photo attached]". Videos are skipped (frames are
   * not worth the inference cost on a shared VPS).
   */
  private async describeNoteMedia(noteId: string, mediaKey: string): Promise<void> {
    try {
      const buffer = await this.storage.getPrivateBuffer(mediaKey);
      const base = (process.env.OLLAMA_BASE_URL?.trim() || 'http://ollama:11434').replace(/\/+$/, '');
      const model = process.env.OLLAMA_VISION_MODEL?.trim() || 'qwen2.5vl:7b';
      // Native /api/chat (not the OpenAI shim): it accepts `images` and,
      // crucially, `options.num_ctx` — the default 4096 ctx is fully eaten
      // by image tokens, truncating the description to a few words.
      const response = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          options: { num_ctx: 8192, temperature: 0.2, num_predict: 120 },
          messages: [
            {
              role: 'user',
              content:
                'What is in this photo? Answer in one short sentence, focusing on food, drinks, activities, or place.',
              images: [buffer.toString('base64')],
            },
          ],
        }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { message?: { content?: string } };
      const description = payload.message?.content?.trim().slice(0, 300);
      if (description) {
        await this.noteRepo.update({ id: noteId }, { mediaNote: description });
      }
    } catch {
      // Vision is best-effort — the note keeps "[photo attached]" otherwise.
    }
  }

  /** Maps an incoming reading to a row, or returns null when it's invalid
   *  (unknown metric, non-finite value) — callers skip nulls so one bad
   *  reading never kills a batch. */
  private toReadingEntityOrNull(reading: IncomingReading): HealthReading | null {
    if (!HEALTH_METRICS.includes(reading.metric)) {
      return null;
    }
    const value = Number(reading.value);
    if (!Number.isFinite(value)) {
      return null;
    }
    const recordedAt = this.parseDate(reading.recordedAt) ?? new Date();
    return {
      id: undefined as unknown as string,
      metric: reading.metric,
      value,
      unit: reading.unit?.trim() || DEFAULT_UNITS[reading.metric],
      recordedAt,
      source: reading.source ?? 'ring',
      raw: reading.raw ?? null,
      createdAt: undefined as unknown as Date,
    };
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // --- Aggregation / queries ---------------------------------------------

  async getSummary(days: number): Promise<HealthSummary> {
    const { from, to } = this.window(days);
    const readings = await this.readingRepo.find({
      where: { recordedAt: MoreThan(from) },
      order: { recordedAt: 'ASC' },
    });
    const notesCount = await this.noteRepo.count({
      where: { recordedAt: MoreThan(from) },
    });

    const grouped = this.groupByMetric(readings);
    const metrics = HEALTH_METRICS.map((metric) =>
      this.summarize(metric, grouped[metric] ?? []),
    );
    this.useFinalNightAsLatest(metrics, grouped);
    const alerts = this.detectAlerts(readings);

    return {
      windowDays: this.clampWindow(days),
      from: from.toISOString(),
      to: to.toISOString(),
      metrics,
      notesCount,
      alerts,
    };
  }

  /**
   * Sleep is a cumulative per-night counter: within a 24h window the LATEST
   * reading is often the in-progress ramp of the night that just started
   * (e.g. 3.7 h at 23:30), which made the widget show only part of the
   * night. Point `latest` at the most complete night instead — the max
   * duration in the window — and pair quality from the same timestamp.
   */
  private useFinalNightAsLatest(
    metrics: MetricSummary[],
    grouped: Record<string, HealthReading[]>,
  ): void {
    const durations = grouped['sleep_duration_h'] ?? [];
    if (durations.length === 0) return;
    const finalRow = durations.reduce((a, b) => (b.value >= a.value ? b : a));
    const durationSummary = metrics.find((m) => m.metric === 'sleep_duration_h');
    if (durationSummary) {
      durationSummary.latest = {
        recordedAt: finalRow.recordedAt.toISOString(),
        value: finalRow.value,
      };
    }
    const qualities = grouped['sleep_quality'] ?? [];
    const qualitySummary = metrics.find((m) => m.metric === 'sleep_quality');
    if (!qualitySummary || qualities.length === 0) return;
    const matching =
      qualities.find((q) => q.recordedAt.getTime() === finalRow.recordedAt.getTime()) ??
      qualities[qualities.length - 1];
    qualitySummary.latest = {
      recordedAt: matching.recordedAt.toISOString(),
      value: matching.value,
    };
  }

  /**
   * Generates a single actionable AI health tip from the last hour of ring
   * readings. Returns null (with skippedReason) when data is stale or absent
   * so the Telegram bot can stay silent instead of advising on old numbers.
   *
   * Caching: once a tip is generated it is reused for TIP_CACHE_MS (1 hour)
   * across every consumer — widget, Telegram bot, iOS app. An LLM call (and a
   * new history row) happens only when the cache expires, so the cadence is
   * strictly one tip per hour regardless of how often the endpoint is hit.
   */
  async getHourlyTip(): Promise<HourlyTipResult> {
    const now = new Date();

    // Serve the cached tip if it's still fresh. All consumers share it.
    const cached = await this.latestTip();
    if (cached && now.getTime() - cached.generatedAt.getTime() < TIP_CACHE_MS) {
      return { tip: cached.content, generatedAt: cached.generatedAt.toISOString() };
    }

    const cutoff = new Date(now.getTime() - TIP_STALENESS_HOURS * 3_600_000);
    const readings = await this.readingRepo.find({
      where: { recordedAt: MoreThan(cutoff) },
      order: { recordedAt: 'ASC' },
    });

    if (readings.length === 0) {
      return { tip: null, generatedAt: now.toISOString(), skippedReason: 'no_data' };
    }

    // Sleep needs a longer lens than the 3h staleness window: the ring
    // reports a cumulative per-night counter, so the "last night total" is
    // the latest value of the current episode, which can end hours before
    // the tip is generated. Fetched separately over 36h.
    const sleepHistory = await this.readingRepo.find({
      where: {
        recordedAt: MoreThan(new Date(now.getTime() - 36 * 3_600_000)),
        metric: In(['sleep_duration_h', 'sleep_quality'] as HealthMetric[]),
      },
      order: { recordedAt: 'ASC' },
    });

    // Notes from the last 24h (feelings, food, plans) — the qualitative
    // context the metrics don't carry.
    const recentNotes = await this.noteRepo.find({
      where: { recordedAt: MoreThan(new Date(now.getTime() - 24 * 3_600_000)) },
      order: { recordedAt: 'ASC' },
      take: 30,
    });

    const weatherLine = await this.weather.currentLine().catch(() => null);
    const context = this.buildTipContext(readings, now, weatherLine, sleepHistory, recentNotes);
    try {
      const tip = await this.aiComplete(TIP_SYSTEM_PROMPT, context);
      await this.saveTipIfNew(tip, now);
      return { tip, generatedAt: now.toISOString() };
    } catch (error) {
      // LLM outage/quota exhaustion: serve the last good tip instead of
      // failing every consumer. Its generatedAt still shows the true age.
      if (cached) {
        return { tip: cached.content, generatedAt: cached.generatedAt.toISOString() };
      }
      throw error;
    }
  }

  /** Most recently persisted tip, or null if none exists. */
  private async latestTip(): Promise<HealthTip | null> {
    const rows = await this.tipRepo.find({
      order: { generatedAt: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  /** Returns paginated tip history (newest first). */
  async listTips(limit = 20, offset = 0): Promise<TipListPage> {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(1, limit), 100) : 20;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;
    const [rows, total] = await this.tipRepo.findAndCount({
      order: { generatedAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        content: r.content,
        generatedAt: r.generatedAt.toISOString(),
      })),
      total,
      hasMore: safeOffset + rows.length < total,
    };
  }

  /** Stores a tip unless it duplicates the most recent one (avoids repeats). */
  private async saveTipIfNew(content: string, generatedAt: Date): Promise<void> {
    // find + take:1 instead of findOne because TypeORM requires a `where`
    // clause for findOne in this version.
    const latest = await this.tipRepo.find({
      order: { generatedAt: 'DESC' },
      take: 1,
    });
    if (latest[0]?.content === content) return;
    await this.tipRepo.save({ content, generatedAt });
  }

  // --- Body stats ---------------------------------------------------------

  async getBodyStats(): Promise<BodyStats> {
    const row = await this.contentRepo.findOne({
      where: { key: 'body_stats' as ContentKey },
    });
    const data = (row?.data ?? {}) as Partial<BodyStats>;
    const heightCm = Number(data.heightCm) || DEFAULT_BODY_STATS.heightCm;
    const weightKg = Number(data.weightKg) || DEFAULT_BODY_STATS.weightKg;
    return {
      heightCm,
      weightKg,
      bmi: this.computeBmi(heightCm, weightKg),
      updatedAt: row?.updatedAt?.toISOString() ?? new Date(0).toISOString(),
    };
  }

  async updateBodyStats(input: { heightCm: number; weightKg: number }): Promise<BodyStats> {
    const heightCm = this.clampBodyStat(input.heightCm, 100, 250);
    const weightKg = this.clampBodyStat(input.weightKg, 30, 300);
    await this.contentRepo.save({
      key: 'body_stats' as ContentKey,
      data: { heightCm, weightKg },
    });
    return {
      heightCm,
      weightKg,
      bmi: this.computeBmi(heightCm, weightKg),
      updatedAt: new Date().toISOString(),
    };
  }

  private computeBmi(heightCm: number, weightKg: number): number {
    const meters = heightCm / 100;
    if (meters <= 0) return 0;
    return Math.round((weightKg / (meters * meters)) * 10) / 10;
  }

  private clampBodyStat(value: number, min: number, max: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  /**
   * Builds an hourly average series for one metric over the current calendar
   * day (plus `days - 1` extra days back, so `days=1` is today only). Used by
   * the iOS Profile page's stress graph: 24 buckets (one per hour), each
   * holding the mean of the readings recorded during that local clock hour.
   * Empty hours come back as `value: null` so the chart can render gaps
   * rather than a misleading zero baseline.
   */
  async getHourlySeries(
    metric: HealthMetric,
    days = 1,
    tzOffsetMinutes = 0,
  ): Promise<HourlySeries> {
    const safeMetric = HEALTH_METRICS.includes(metric) ? metric : 'stress';
    const span = Math.max(1, Math.min(days, 365));
    // Buckets follow the CLIENT's local clock: tzOffsetMinutes is the
    // client's offset from UTC in minutes (+180 for Moscow). The window
    // starts at local midnight so "today" runs to the current local hour —
    // UTC bucketing would leave the chart 3 hours behind for UTC+3.
    const offsetMs =
      Math.max(-720, Math.min(840, Math.round(tzOffsetMinutes))) * 60_000;
    const localNow = Date.now() + offsetMs;
    const localMidnight = Math.floor(localNow / 86_400_000) * 86_400_000;
    const from = new Date(localMidnight - (span - 1) * 86_400_000 - offsetMs);

    const readings = await this.readingRepo.find({
      where: { recordedAt: MoreThan(from), metric: safeMetric },
      order: { recordedAt: 'ASC' },
    });

    // Accumulate per-hour sums and counts over the window. `latestAt` tracks
    // the most recent reading time in each bucket so the chart can show when
    // the data was actually collected (readings arrive ordered ASC by time).
    const sums = new Array(24).fill(0);
    const counts = new Array(24).fill(0);
    const latestAtMs = new Array(24).fill(0);
    let unit: string | null = null;
    for (const r of readings) {
      if (unit === null) unit = r.unit ?? DEFAULT_UNITS[safeMetric];
      const hour = new Date(r.recordedAt.getTime() + offsetMs).getUTCHours();
      sums[hour] += r.value;
      counts[hour] += 1;
      latestAtMs[hour] = Math.max(latestAtMs[hour], r.recordedAt.getTime());
    }

    const buckets: HourlyBucket[] = sums.map((sum, hour) => ({
      hour,
      value: counts[hour] > 0 ? Math.round((sum / counts[hour]) * 100) / 100 : null,
      count: counts[hour],
      latestAt: counts[hour] > 0 ? new Date(latestAtMs[hour]).toISOString() : null,
    }));

    return {
      metric: safeMetric,
      unit: unit ?? DEFAULT_UNITS[safeMetric],
      buckets,
    };
  }

  /**
   * Raw time series for one metric over a rolling window of the last `days`
   * days — unlike `getHourlySeries`, which folds the window into 24
   * hour-of-day buckets. Powers the iOS metric detail charts (24h/7d/30d).
   */
  async getMetricSeries(metric: HealthMetric, days = 1): Promise<MetricSeries> {
    const safeMetric = HEALTH_METRICS.includes(metric) ? metric : 'stress';
    const span = Math.max(1, Math.min(days, 365));
    const { from } = this.window(span);
    const readings = await this.readingRepo.find({
      where: { recordedAt: MoreThan(from), metric: safeMetric },
      order: { recordedAt: 'ASC' },
    });
    const points: MetricSeriesPoint[] = readings.map((r) => ({
      recordedAt: r.recordedAt.toISOString(),
      value: r.value,
    }));
    return {
      metric: safeMetric,
      unit: readings.find((r) => r.unit)?.unit ?? DEFAULT_UNITS[safeMetric],
      windowDays: span,
      summary: this.summarize(safeMetric, readings),
      points: this.downsample(points),
    };
  }

  // --- Sleep sessions (rich stage data) -------------------------------------

  /** Upserts nights by endedAt — ring history re-syncs resend the same nights. */
  async addSleepSessions(sessions: IncomingSleepSession[]): Promise<{ inserted: number }> {
    const rows = sessions
      .map((s) => this.toSleepSessionOrNull(s))
      .filter((row): row is NonNullable<typeof row> => row !== null);
    if (rows.length === 0) return { inserted: 0 };
    // Collapse duplicate end times inside the batch (same night twice).
    const byEnd = new Map<string, (typeof rows)[number]>();
    for (const row of rows) byEnd.set(row.endedAt.toISOString(), row);
    await this.sleepRepo
      .createQueryBuilder()
      .insert()
      .values([...byEnd.values()] as never)
      .orUpdate(
        ['startedAt', 'durationMin', 'deepMin', 'remMin', 'lightMin', 'awakeMin', 'score', 'raw'],
        ['endedAt'],
      )
      .execute();
    return { inserted: byEnd.size };
  }

  private toSleepSessionOrNull(s: IncomingSleepSession) {
    const start = this.parseDate(s?.start);
    const end = this.parseDate(s?.end);
    if (!start || !end || end <= start) return null;
    const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
    if (durationMin < 30 || durationMin > 18 * 60) return null; // sanity: 30m..18h
    const stage = (v?: number) => Math.max(0, Math.round(Number(v) || 0));
    return {
      startedAt: start,
      endedAt: end,
      durationMin,
      deepMin: stage(s.deepMin),
      remMin: stage(s.remMin),
      lightMin: stage(s.lightMin),
      awakeMin: stage(s.awakeMin),
      score: Number.isFinite(Number(s.score)) ? Number(s.score) : 0,
      raw: s.raw ?? null,
    };
  }

  /** Nights + aggregates for the iOS sleep page. tzOffset (client minutes
   *  from UTC) makes the bedtime spread follow the local clock. */
  async getSleepSessions(days = 7, tzOffsetMinutes = 0): Promise<SleepOverview> {
    const span = Math.max(1, Math.min(days, 90));
    const offset = Math.max(-720, Math.min(840, Math.round(tzOffsetMinutes)));
    const from = new Date(Date.now() - span * 86400000);
    const rows = await this.sleepRepo.find({
      where: { endedAt: MoreThan(from) },
      order: { endedAt: 'DESC' },
    });
    const sessions: SleepSessionView[] = rows.map((r) => ({
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt.toISOString(),
      durationMin: r.durationMin,
      deepMin: r.deepMin,
      remMin: r.remMin,
      lightMin: r.lightMin,
      awakeMin: r.awakeMin,
      score: r.score,
    }));
    return {
      days: span,
      sessions,
      avgScore: rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : null,
      avgDurationMin: rows.length
        ? Math.round(rows.reduce((a, r) => a + r.durationMin, 0) / rows.length)
        : null,
      bedtimeRange: this.bedtimeRange(rows, offset),
      debtMin: rows.reduce((acc, r) => acc + Math.max(0, 480 - r.durationMin), 0),
    };
  }

  /** Bedtime spread as LOCAL minutes after midnight. Evening-anchored so
   *  23:50 and 00:20 are 30 minutes apart, not ~24h. */
  private bedtimeRange(
    rows: SleepSession[],
    offsetMinutes: number,
  ): SleepOverview['bedtimeRange'] {
    if (rows.length === 0) return null;
    // Anchor at 18:00 local: 22:47 → 287, 00:20 → 380 — one linear scale.
    const anchored = rows.map((r) => {
      const localMin = Math.floor(r.startedAt.getTime() / 60000 + offsetMinutes);
      return (((localMin % 1440) + 1440) % 1440 - 1080 + 1440) % 1440;
    });
    const toLocal = (anchoredMin: number) => (anchoredMin + 1080) % 1440;
    return {
      earliestMin: toLocal(Math.min(...anchored)),
      latestMin: toLocal(Math.max(...anchored)),
    };
  }

  // --- Morning recovery ------------------------------------------------------

  /**
   * 0–100 recovery score: last night's sleep (50%) + HRV vs the 14-day
   * baseline (25%) + resting HR vs baseline (25%). Weights renormalize when a
   * component is missing. Also emits deviation alerts (HRV drop ≥ 20%,
   * resting-HR rise ≥ 8 bpm, very low sleep score).
   */
  async getRecovery(): Promise<RecoveryScore> {
    const now = Date.now();
    const dayAgo = new Date(now - 86400000);
    const readings = await this.readingRepo.find({
      where: {
        recordedAt: MoreThan(new Date(now - 14 * 86400000)),
        metric: In(['hrv', 'heart_rate'] as HealthMetric[]),
      },
      order: { recordedAt: 'ASC' },
    });
    const recent = readings.filter((r) => r.recordedAt >= dayAgo);
    const older = readings.filter((r) => r.recordedAt < dayAgo);

    const hrvCurrent = this.mean(recent.filter((r) => r.metric === 'hrv'));
    const hrvBaseline = this.mean(older.filter((r) => r.metric === 'hrv'));
    const rhrCurrent = this.restingHr(recent.filter((r) => r.metric === 'heart_rate'));
    const rhrBaseline = this.restingHr(older.filter((r) => r.metric === 'heart_rate'));
    const sleepScore = await this.latestSleepScore();

    const hrvScore =
      hrvCurrent != null && hrvBaseline
        ? Math.max(0, Math.min(100, Math.round((hrvCurrent / hrvBaseline) * 100)))
        : null;
    const rhrScore =
      rhrCurrent != null && rhrBaseline
        ? Math.max(0, Math.min(100, Math.round(100 - Math.max(0, rhrCurrent - rhrBaseline) * 5)))
        : null;

    const parts: Array<[number, number]> = [];
    if (sleepScore != null) parts.push([sleepScore, 0.5]);
    if (hrvScore != null) parts.push([hrvScore, 0.25]);
    if (rhrScore != null) parts.push([rhrScore, 0.25]);
    const weightSum = parts.reduce((a, [, w]) => a + w, 0);
    const score =
      weightSum === 0 ? 0 : Math.round(parts.reduce((a, [s, w]) => a + s * w, 0) / weightSum);

    return {
      score,
      label: this.recoveryLabel(score, weightSum),
      generatedAt: new Date(now).toISOString(),
      components: {
        sleepScore,
        hrv: { current: this.round1(hrvCurrent), baseline: this.round1(hrvBaseline) },
        restingHr: { current: rhrCurrent, baseline: rhrBaseline },
      },
      alerts: this.recoveryAlerts(hrvCurrent, hrvBaseline, rhrCurrent, rhrBaseline, sleepScore),
    };
  }

  private recoveryLabel(score: number, weightSum: number): string {
    if (weightSum === 0) return 'No data yet';
    if (score >= 80) return 'Great — good day to push';
    if (score >= 65) return 'Good';
    if (score >= 50) return 'Fair — keep it light';
    return 'Low — rest today';
  }

  private recoveryAlerts(
    hrvCurrent: number | null,
    hrvBaseline: number | null,
    rhrCurrent: number | null,
    rhrBaseline: number | null,
    sleepScore: number | null,
  ): string[] {
    const alerts: string[] = [];
    if (hrvCurrent != null && hrvBaseline && hrvCurrent < hrvBaseline * 0.8) {
      const drop = Math.round((1 - hrvCurrent / hrvBaseline) * 100);
      alerts.push(
        `HRV ${drop}% below your 14-day baseline (${Math.round(hrvCurrent)} vs ${Math.round(hrvBaseline)} ms) — you might be getting sick or overtrained`,
      );
    }
    if (rhrCurrent != null && rhrBaseline && rhrCurrent > rhrBaseline + 8) {
      alerts.push(
        `Resting HR up ${Math.round(rhrCurrent - rhrBaseline)} bpm vs your 14-day baseline (${rhrCurrent} vs ${rhrBaseline} bpm)`,
      );
    }
    if (sleepScore != null && sleepScore < 55) {
      alerts.push(`Last night's sleep score was low (${sleepScore})`);
    }
    return alerts;
  }

  /** Resting-HR proxy: mean of the lowest 10% of readings. */
  private restingHr(rows: HealthReading[]): number | null {
    if (rows.length < 20) return null;
    const sorted = rows.map((r) => r.value).sort((a, b) => a - b);
    const n = Math.max(1, Math.floor(sorted.length * 0.1));
    return Math.round(sorted.slice(0, n).reduce((a, v) => a + v, 0) / n);
  }

  private mean(rows: HealthReading[]): number | null {
    if (rows.length === 0) return null;
    return rows.reduce((a, r) => a + r.value, 0) / rows.length;
  }

  private round1(value: number | null): number | null {
    return value == null ? null : Math.round(value * 10) / 10;
  }

  // --- Streaks, digest, activities, year ---------------------------------

  /** Per-local-day totals for one metric over the window. */
  private async dailyTotals(metric: HealthMetric, days: number, offsetMinutes: number): Promise<Map<number, number>> {
    const from = new Date(Date.now() - days * 86400000);
    const readings = await this.readingRepo.find({
      where: { recordedAt: MoreThan(from), metric },
      order: { recordedAt: 'ASC' },
    });
    const totals = new Map<number, number>();
    for (const r of readings) {
      const day = Math.floor((r.recordedAt.getTime() + offsetMinutes * 60000) / 86400000);
      totals.set(day, (totals.get(day) ?? 0) + r.value);
    }
    return totals;
  }

  /** Current and best streak of days meeting the step goal. */
  private streaks(daily: Map<number, number>, todayKey: number): { current: number; best: number } {
    let current = 0;
    // Today counts only if already reached; otherwise count back from yesterday.
    let day = (daily.get(todayKey) ?? 0) >= STEP_GOAL ? todayKey : todayKey - 1;
    while ((daily.get(day) ?? 0) >= STEP_GOAL) {
      current += 1;
      day -= 1;
    }
    let best = 0;
    let run = 0;
    const keys = [...daily.keys()].sort((a, b) => a - b);
    for (const key of keys) {
      run = (daily.get(key) ?? 0) >= STEP_GOAL ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return { current, best };
  }

  /** Step-goal streak + today's progress (Profile streak card). */
  async getInsights(tzOffsetMinutes = 0): Promise<ActivityInsights> {
    const offset = Math.max(-720, Math.min(840, Math.round(tzOffsetMinutes)));
    const steps = await this.dailyTotals('steps', 90, offset);
    const distance = await this.dailyTotals('distance_km', 2, offset);
    const todayKey = Math.floor((Date.now() + offset * 60000) / 86400000);
    const { current, best } = this.streaks(steps, todayKey);
    const todaySteps = Math.round(steps.get(todayKey) ?? 0);
    return {
      goalSteps: STEP_GOAL,
      todaySteps,
      todayKm: Math.round((distance.get(todayKey) ?? 0) * 100) / 100,
      goalReached: todaySteps >= STEP_GOAL,
      streakDays: current,
      bestStreakDays: best,
    };
  }

  /**
   * LLM-written weekly digest (this week vs last). Cached in site_content
   * for 12h — the iOS Profile card and Telegram /week share it.
   */
  async getDigest(): Promise<WeeklyDigest> {
    const cached = await this.cachedDigest();
    if (cached) return cached;

    const stats = await this.weeklyStats();
    const context = [
      `This week (last 7 days): ${stats.steps} steps, ${stats.km} km` +
        (stats.avgStress != null ? `, avg stress ${stats.avgStress}` : '') +
        (stats.avgSleepScore != null ? `, avg sleep score ${stats.avgSleepScore}` : '') +
        (stats.avgSleepH != null ? `, avg sleep ${stats.avgSleepH} h` : '') +
        (stats.bestDay ? `, best day ${stats.bestDay.date} with ${stats.bestDay.steps} steps` : ''),
      `Previous week: ${stats.prevSteps} steps, ${stats.prevKm} km` +
        (stats.prevAvgSleepScore != null ? `, avg sleep score ${stats.prevAvgSleepScore}` : ''),
    ].join('\n');
    const text = await this.aiComplete(DIGEST_SYSTEM_PROMPT, context);
    const digest: WeeklyDigest = { text, generatedAt: new Date().toISOString(), stats };
    await this.contentRepo.save({
      key: 'weekly_digest' as ContentKey,
      data: digest as unknown,
    });
    return digest;
  }

  /** Returns the cached digest when it's less than 12h old. */
  private async cachedDigest(): Promise<WeeklyDigest | null> {
    const row = await this.contentRepo.findOne({
      where: { key: 'weekly_digest' as ContentKey },
    });
    const data = row?.data as WeeklyDigest | undefined;
    if (!data?.generatedAt || !data.text) return null;
    const age = Date.now() - new Date(data.generatedAt).getTime();
    return age < 12 * 3600000 ? data : null;
  }

  private async weeklyStats(): Promise<WeeklyDigest['stats']> {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * 86400000);
    const twoWeeksAgo = new Date(now - 14 * 86400000);
    const readings = await this.readingRepo.find({
      where: { recordedAt: MoreThan(twoWeeksAgo) },
      order: { recordedAt: 'ASC' },
    });
    const thisWeek = readings.filter((r) => r.recordedAt >= weekAgo);
    const prevWeek = readings.filter((r) => r.recordedAt < weekAgo);
    const sum = (rows: HealthReading[], metric: HealthMetric) =>
      rows.filter((r) => r.metric === metric).reduce((a, r) => a + r.value, 0);

    const byDay = new Map<string, number>();
    for (const r of thisWeek.filter((r) => r.metric === 'steps')) {
      const day = r.recordedAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + r.value);
    }
    let bestDay: { date: string; steps: number } | null = null;
    for (const [date, steps] of byDay) {
      if (!bestDay || steps > bestDay.steps) bestDay = { date, steps: Math.round(steps) };
    }

    const sleep = await this.sleepRepo.find({
      where: { endedAt: MoreThan(twoWeeksAgo) },
      order: { endedAt: 'ASC' },
    });
    const sleepThis = sleep.filter((s) => s.endedAt >= weekAgo);
    const sleepPrev = sleep.filter((s) => s.endedAt < weekAgo);
    const avgScore = (rows: SleepSession[]) =>
      rows.length ? Math.round(rows.reduce((a, s) => a + s.score, 0) / rows.length) : null;

    return {
      steps: Math.round(sum(thisWeek, 'steps')),
      km: this.round1(sum(thisWeek, 'distance_km')) ?? 0,
      avgStress: this.round1(this.mean(thisWeek.filter((r) => r.metric === 'stress'))),
      avgSleepScore: avgScore(sleepThis),
      avgSleepH: sleepThis.length
        ? this.round1(sleepThis.reduce((a, s) => a + s.durationMin, 0) / sleepThis.length / 60)
        : null,
      bestDay,
      prevSteps: Math.round(sum(prevWeek, 'steps')),
      prevKm: this.round1(sum(prevWeek, 'distance_km')) ?? 0,
      prevAvgSleepScore: avgScore(sleepPrev),
    };
  }

  /**
   * Auto-detected activities: hourly step slots above the active threshold,
   * merged across gaps up to 75 min, kept when the window totals ≥ 800
   * steps. HR stats come from the readings inside each window.
   */
  async getActivities(days = 7): Promise<DetectedActivity[]> {
    const span = Math.max(1, Math.min(days, 365));
    const from = new Date(Date.now() - span * 86400000);
    const readings = await this.readingRepo.find({
      where: {
        recordedAt: MoreThan(from),
        metric: In(['steps', 'distance_km', 'heart_rate'] as HealthMetric[]),
      },
      order: { recordedAt: 'ASC' },
    });
    const slots = readings
      .filter((r) => r.metric === 'steps' && r.value >= 500)
      .map((r) => ({ at: r.recordedAt, steps: r.value }));

    const windows: Array<{ start: Date; end: Date }> = [];
    for (const slot of slots) {
      const last = windows[windows.length - 1];
      if (last && slot.at.getTime() - last.end.getTime() <= 75 * 60000) {
        last.end = slot.at;
      } else {
        windows.push({ start: slot.at, end: slot.at });
      }
    }

    const activities: DetectedActivity[] = [];
    for (const w of windows) {
      const end = new Date(w.end.getTime() + 3600000); // slot covers the hour
      const inside = readings.filter((r) => r.recordedAt >= w.start && r.recordedAt < end);
      const steps = Math.round(inside.filter((r) => r.metric === 'steps').reduce((a, r) => a + r.value, 0));
      if (steps < 800) continue;
      const hrs = inside.filter((r) => r.metric === 'heart_rate').map((r) => r.value);
      activities.push({
        start: w.start.toISOString(),
        end: end.toISOString(),
        steps,
        km: this.round1(inside.filter((r) => r.metric === 'distance_km').reduce((a, r) => a + r.value, 0)) ?? 0,
        avgHr: hrs.length ? Math.round(hrs.reduce((a, v) => a + v, 0) / hrs.length) : null,
        peakHr: hrs.length ? Math.max(...hrs) : null,
      });
    }
    return activities.reverse(); // newest first
  }

  /** Year-in-review stats (window: last 365 days of data). */
  async getYearReview(tzOffsetMinutes = 0): Promise<YearReview> {
    const offset = Math.max(-720, Math.min(840, Math.round(tzOffsetMinutes)));
    const steps = await this.dailyTotals('steps', 365, offset);
    const distance = await this.dailyTotals('distance_km', 365, offset);
    const todayKey = Math.floor((Date.now() + offset * 60000) / 86400000);

    let totalSteps = 0;
    let bestDay: YearReview['bestDay'] = null;
    for (const [day, value] of steps) {
      totalSteps += value;
      if (!bestDay || value > bestDay.steps) {
        bestDay = { date: new Date((day * 86400000 - offset * 60000)).toISOString().slice(0, 10), steps: Math.round(value) };
      }
    }
    let totalKm = 0;
    for (const value of distance.values()) totalKm += value;

    const sleep = await this.sleepRepo.find({ order: { endedAt: 'ASC' } });
    const activities = await this.getActivities(365);
    const longest = activities.reduce(
      (max, a) => Math.max(max, (new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000),
      0,
    );

    return {
      daysWithData: steps.size,
      totalSteps: Math.round(totalSteps),
      totalKm: this.round1(totalKm) ?? 0,
      bestStreakDays: this.streaks(steps, todayKey).best,
      bestDay,
      avgSleepScore: sleep.length
        ? Math.round(sleep.reduce((a, s) => a + s.score, 0) / sleep.length)
        : null,
      avgSleepH: sleep.length
        ? this.round1(sleep.reduce((a, s) => a + s.durationMin, 0) / sleep.length / 60)
        : null,
      longestActivityMin: longest > 0 ? Math.round(longest) : null,
    };
  }

  /** Latest night's composite score; falls back to the best sleep_quality
   *  reading in 36h for data predating the sleep_sessions table. */
  private async latestSleepScore(): Promise<number | null> {
    const rows = await this.sleepRepo.find({ order: { endedAt: 'DESC' }, take: 1 });
    if (rows[0]) return Math.round(rows[0].score);
    const fallback = await this.readingRepo.find({
      where: {
        recordedAt: MoreThan(new Date(Date.now() - 36 * 3600000)),
        metric: 'sleep_quality',
      },
      order: { value: 'DESC' },
      take: 1,
    });
    return fallback[0] ? Math.round(fallback[0].value) : null;
  }

  /**
   * Combined payload for the iOS home-screen widget: today's summary plus the
   * hourly tip, in a single request. The summary always renders; the tip is
   * best-effort so an LLM failure (502/503/500) never blocks the status.
   */
  async getWidgetPayload(): Promise<{ summary: HealthSummary; tip: HourlyTipResult }> {
    const summary = await this.getSummary(1);
    let tip: HourlyTipResult;
    try {
      tip = await this.getHourlyTip();
    } catch {
      tip = { tip: null, generatedAt: new Date().toISOString(), skippedReason: 'error' };
    }
    return { summary, tip };
  }

  async getOverview(days: number): Promise<HealthOverview> {
    const { from, to } = this.window(days);
    const [readings, notes] = await Promise.all([
      this.readingRepo.find({
        where: { recordedAt: MoreThan(from) },
        order: { recordedAt: 'ASC' },
      }),
      this.noteRepo.find({
        where: { recordedAt: MoreThan(from) },
        order: { recordedAt: 'DESC' },
        take: 200,
      }),
    ]);
    const alerts = this.detectAlerts(readings);

    const grouped = this.groupByMetric(readings);
    const metrics = HEALTH_METRICS.map((metric) => {
      const points = (grouped[metric] ?? []).map((r) => ({
        recordedAt: r.recordedAt.toISOString(),
        value: r.value,
      }));
      return {
        ...this.summarize(metric, grouped[metric] ?? []),
        series: this.downsample(points),
      };
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      metrics,
      notes: notes.map((note) => ({
        id: note.id,
        content: note.content,
        mood: note.mood,
        source: note.source,
        recordedAt: note.recordedAt.toISOString(),
      })),
      alerts,
    };
  }

  // --- Public exposure ----------------------------------------------------

  async getPublicPayload(): Promise<PublicHealthPayload> {
    const config = await this.getPublicConfig();
    if (!config.enabled) {
      return {
        enabled: false,
        displayName: config.displayName,
        windowDays: config.windowDays,
        metrics: [],
        now: null,
      };
    }

    const { from } = this.window(config.windowDays);
    const enabledMetrics = HEALTH_METRICS.filter(
      (metric) => config.metrics[metric]?.show,
    );
    if (enabledMetrics.length === 0) {
      return {
        enabled: true,
        displayName: config.displayName,
        windowDays: config.windowDays,
        metrics: [],
        now: null,
      };
    }

    const readings = await this.readingRepo.find({
      where: { recordedAt: MoreThan(from) },
      order: { recordedAt: 'ASC' },
    });
    const grouped = this.groupByMetric(readings);

    return {
      enabled: true,
      displayName: config.displayName,
      windowDays: config.windowDays,
      metrics: enabledMetrics.map((metric) => {
        const rows = grouped[metric] ?? [];
        const points = rows.map((r) => ({
          recordedAt: r.recordedAt.toISOString(),
          value: r.value,
        }));
        return {
          metric,
          label: config.metrics[metric]?.label || METRIC_LABELS[metric],
          unit: rows[0]?.unit ?? DEFAULT_UNITS[metric],
          summary: this.summarize(metric, rows),
          series: this.downsample(points),
        };
      }),
      now: this.computeNowStatus(readings),
    };
  }

  /**
   * Coarse "what is the owner doing right now" for the landing page badge.
   * Derived only from recent readings; returns null when data is stale
   * (> 3h) so the badge hides instead of lying. Night hours are approximated
   * in UTC (21:00–04:00 ≈ midnight–7am in the owner's UTC+3).
   */
  private computeNowStatus(readings: HealthReading[]): PublicNowStatus | null {
    if (readings.length === 0) return null;
    const now = Date.now();
    const latest = readings[readings.length - 1].recordedAt.getTime();
    if (now - latest > 3 * 3_600_000) return null;

    const recentValues = (ms: number, metric: HealthMetric) =>
      readings
        .filter((r) => r.metric === metric && now - r.recordedAt.getTime() < ms)
        .map((r) => r.value);

    const hr = recentValues(15 * 60_000, 'heart_rate');
    const avgHr = hr.length ? hr.reduce((a, v) => a + v, 0) / hr.length : 0;
    if (avgHr >= 110) return { status: 'working_out' };

    const steps75 = recentValues(75 * 60_000, 'steps').reduce((a, v) => a + v, 0);
    if (steps75 >= 200) return { status: 'walking' };

    const utcHour = new Date(now).getUTCHours();
    const steps2h = recentValues(2 * 3_600_000, 'steps').reduce((a, v) => a + v, 0);
    if ((utcHour >= 21 || utcHour <= 4) && steps2h < 50) return { status: 'asleep' };

    return { status: 'resting' };
  }

  async isPublicEnabled(): Promise<boolean> {
    return (await this.getPublicConfig()).enabled;
  }

  // --- Public config storage (reuses the JSONB site_content table) --------

  async getPublicConfig(): Promise<HealthPublicConfig> {
    const row = await this.contentRepo.findOne({
      where: { key: 'health_public' as ContentKey },
    });
    if (!row?.data) {
      return { ...DEFAULT_PUBLIC_CONFIG };
    }
    const data = row.data as Partial<HealthPublicConfig>;
    return {
      ...DEFAULT_PUBLIC_CONFIG,
      ...data,
      metrics: { ...data.metrics },
    };
  }

  async updatePublicConfig(config: HealthPublicConfig): Promise<HealthPublicConfig> {
    const normalized: HealthPublicConfig = {
      enabled: Boolean(config.enabled),
      displayName: (config.displayName ?? '').trim().slice(0, 80) || 'Health',
      windowDays: this.clampWindow(config.windowDays),
      metrics: this.normalizeMetricConfigs(config.metrics),
    };
    await this.contentRepo.save({
      key: 'health_public' as ContentKey,
      data: normalized as unknown,
    });
    return normalized;
  }

  private normalizeMetricConfigs(
    metrics: HealthPublicConfig['metrics'],
  ): HealthPublicConfig['metrics'] {
    const result: HealthPublicConfig['metrics'] = {};
    for (const metric of HEALTH_METRICS) {
      const entry = metrics?.[metric];
      if (entry?.show) {
        result[metric] = {
          show: true,
          ...(entry.label?.trim() ? { label: entry.label.trim().slice(0, 48) } : {}),
        };
      }
    }
    return result;
  }

  // --- Helpers ------------------------------------------------------------

  private window(days: number): { from: Date; to: Date } {
    const to = new Date();
    const from = new Date(to.getTime() - Math.max(0, Math.min(days, 365)) * 86400000);
    return { from, to };
  }

  private clampWindow(days: number | undefined): number {
    const value = Number(days ?? 7);
    if (!Number.isFinite(value)) return 7;
    return Math.max(1, Math.min(365, Math.round(value)));
  }

  private groupByMetric(readings: HealthReading[]): Record<string, HealthReading[]> {
    const groups: Record<string, HealthReading[]> = {};
    for (const reading of readings) {
      (groups[reading.metric] ??= []).push(reading);
    }
    return groups;
  }

  private summarize(metric: HealthMetric, rows: HealthReading[]): MetricSummary {
    if (rows.length === 0) {
      return { metric, count: 0, avg: null, min: null, max: null, latest: null };
    }
    const values = rows.map((r) => r.value);
    const latest = rows[rows.length - 1];
    const sum = values.reduce((acc, value) => acc + value, 0);
    return {
      metric,
      count: values.length,
      avg: Math.round((sum / values.length) * 100) / 100,
      min: Math.min(...values),
      max: Math.max(...values),
      latest: {
        recordedAt: latest.recordedAt.toISOString(),
        value: latest.value,
      },
    };
  }

  /**
   * Builds the compact metrics block fed to the LLM: the per-metric average over
   * the last hour, falling back to the most recent value within the staleness
   * window when the hour itself has no readings for that metric.
   */
  private buildTipContext(
    allRecent: HealthReading[],
    now: Date,
    weatherLine: string | null = null,
    sleepHistory: HealthReading[] = [],
    notes: HealthNote[] = [],
  ): string {
    const windowStart = new Date(now.getTime() - TIP_WINDOW_HOURS * 3_600_000);
    const grouped = this.groupByMetric(allRecent);
    const lines: string[] = [
      `Current time: ${now.toLocaleString('en-GB', { timeZone: 'UTC', hour12: false })} UTC`,
      `Metrics (last ${TIP_WINDOW_HOURS}h average, with latest as fallback):`,
    ];
    if (weatherLine) {
      lines.push(`Weather outside: ${weatherLine}`);
    }
    if (notes.length > 0) {
      lines.push('Recent notes (feelings, food, plans — factor these in):');
      for (const note of notes) {
        const at = note.recordedAt.toLocaleString('en-GB', {
          timeZone: 'UTC',
          hour12: false,
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        const media = note.mediaNote
          ? ` [photo: ${note.mediaNote}]`
          : note.mediaType
            ? ` [${note.mediaType} attached]`
            : '';
        lines.push(`- [${at} UTC] "${note.content}"${media}`);
      }
    }
    // Sleep is handled separately below — its cumulative per-night counter
    // is meaningless as a last-hour average.
    const sleepLine = this.sleepContextLine(sleepHistory, now);
    if (sleepLine) lines.push(sleepLine);
    // Slot metrics (steps/calories/distance) arrive as per-hour slots that
    // the ring fills only when the hour completes — a rolling "last 60 min"
    // window systematically misses them (a 13:00 walk is invisible at
    // 14:21). Use the last full hour's slot + the current one, summed.
    const slotStart = new Date(now);
    slotStart.setUTCMinutes(0, 0, 0);
    slotStart.setUTCHours(slotStart.getUTCHours() - 1);
    const slotLabel = `${String(slotStart.getUTCHours()).padStart(2, '0')}:00 UTC`;
    const SLOT_METRICS = new Set<string>(['steps', 'calories', 'distance_km']);
    for (const metric of HEALTH_METRICS) {
      if (metric === 'sleep_duration_h' || metric === 'sleep_quality') continue;
      const rows = grouped[metric] ?? [];
      if (SLOT_METRICS.has(metric)) {
        const slotRows = rows.filter((r) => r.recordedAt >= slotStart);
        const used = slotRows.length > 0 ? slotRows : rows.slice(-1);
        if (used.length === 0) continue;
        const total = Math.round(used.reduce((a, r) => a + r.value, 0) * 100) / 100;
        lines.push(
          `- ${METRIC_LABELS[metric]}: ${total} ${DEFAULT_UNITS[metric]} since ${slotLabel}`,
        );
        continue;
      }
      const inWindow = rows.filter((r) => r.recordedAt >= windowStart);
      const used = inWindow.length > 0 ? inWindow : rows.slice(-1);
      if (used.length === 0) continue;
      const values = used.map((r) => r.value);
      const avg = Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 100) / 100;
      const unit = DEFAULT_UNITS[metric];
      lines.push(`- ${METRIC_LABELS[metric]}: ${avg} ${unit} (latest ${values[values.length - 1]})`);
    }
    return lines.join('\n');
  }

  /**
   * Builds the sleep line for the tip context. The ring reports sleep as a
   * CUMULATIVE per-night counter, and history contains in-progress ramp
   * snapshots that sort AFTER the completed night — so "last night" is the
   * MAX duration in the window (ties → the later, better-anchored row), not
   * the temporally last row. A newer, smaller, still-growing ramp means the
   * next night is in progress and is reported as "so far" instead — the LLM
   * must never read mid-night progress as a full night ("you slept 3.4 h").
   */
  private sleepContextLine(history: HealthReading[], now: Date): string | null {
    const durations = history.filter((r) => r.metric === 'sleep_duration_h');
    if (durations.length === 0) return null;

    const finalRow = durations.reduce((a, b) =>
      b.value > a.value || (b.value === a.value && b.recordedAt > a.recordedAt) ? b : a,
    );
    const lastRow = durations[durations.length - 1];
    const rampIsFresh = now.getTime() - lastRow.recordedAt.getTime() < 2 * 3_600_000;
    const inProgress = lastRow !== finalRow && lastRow.value < finalRow.value && rampIsFresh;
    const focus = inProgress ? lastRow : finalRow;
    const total = Math.round(focus.value * 10) / 10;

    // Quality paired from the nearest-quality row by timestamp (the ramp and
    // the final can carry different legacy timestamps for the same night).
    const qualityRows = history.filter((r) => r.metric === 'sleep_quality');
    const quality = qualityRows.reduce<HealthReading | null>(
      (best, q) =>
        !best ||
        Math.abs(q.recordedAt.getTime() - focus.recordedAt.getTime()) <
          Math.abs(best.recordedAt.getTime() - focus.recordedAt.getTime())
          ? q
          : best,
      null,
    );
    const qualityText = quality ? `, quality ${Math.round(quality.value)}%` : '';

    return inProgress
      ? `- Sleep: ${total} h so far this night${qualityText} — the night is STILL IN PROGRESS; do not treat this as a full night of sleep`
      : `- Sleep last night: ${total} h total${qualityText}`;
  }

  /**
   * Tip generation: DeepSeek (paid, primary), falling back to the local
   * Ollama (free, on-VPS — currently `politrack_ollama` with qwen2.5-14b)
   * when DeepSeek is unconfigured, unreachable, or errors.
   */
  private async aiComplete(system: string, user: string): Promise<string> {
    const messages: GlmMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    try {
      return await this.deepseekComplete(messages);
    } catch {
      // DeepSeek down or errored — fall through to the local model.
    }
    return this.ollamaComplete(messages);
  }

  /** Calls the DeepSeek chat-completions API (OpenAI-compatible). */
  private async deepseekComplete(messages: GlmMessage[]): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('Health tip AI is not configured');
    }
    const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';
    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      // Reasoning models spend much of the token budget on reasoning_content
      // before emitting content: a small max_tokens leaves the actual answer
      // empty, so give it headroom well beyond what a 60-word tip needs.
      body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 2048 }),
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new BadGatewayException(`DeepSeek API error: ${response.status} ${raw.slice(0, 300)}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new InternalServerErrorException('Empty AI response');
    }
    return text;
  }

  /**
   * Calls the compose-local Ollama service through its OpenAI-compatible
   * endpoint (it shares politrack_ollama's model store, so qwen2.5-14b is
   * already pulled — free, on-VPS, no API key).
   */
  private async ollamaComplete(messages: GlmMessage[]): Promise<string> {
    const base = (process.env.OLLAMA_BASE_URL?.trim() || 'http://ollama:11434')
      .replace(/\/+$/, '');
    const model = process.env.OLLAMA_MODEL?.trim() || 'qwen2.5:14b-instruct-q5_K_M';
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 512, stream: false }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new BadGatewayException(`Ollama API error: ${response.status} ${raw.slice(0, 200)}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new InternalServerErrorException('Empty Ollama response');
    }
    return text;
  }

  private detectAlerts(readings: HealthReading[]): HealthAlert[] {
    const alerts: HealthAlert[] = [];
    const seen = new Set<string>();
    for (const rule of ANOMALY_RULES) {
      const matching = readings
        .filter((r) => r.metric === rule.metric && rule.test(r.value))
        .slice(-3);
      for (const reading of matching) {
        const key = `${rule.metric}-${rule.level}-${reading.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        alerts.push({
          metric: rule.metric,
          level: rule.level,
          message: rule.message,
          value: reading.value,
          recordedAt: reading.recordedAt.toISOString(),
        });
      }
    }
    return alerts;
  }

  private downsample(points: MetricSeriesPoint[]): MetricSeriesPoint[] {
    if (points.length <= MAX_SERIES_POINTS) return points;
    const stride = Math.ceil(points.length / MAX_SERIES_POINTS);
    const result: MetricSeriesPoint[] = [];
    for (let i = 0; i < points.length; i += stride) {
      result.push(points[i]);
    }
    // Always keep the last point so the tail isn't truncated.
    const last = points[points.length - 1];
    if (result[result.length - 1] !== last) {
      result.push(last);
    }
    return result;
  }

  /** Used by callers that need to prune very old data (not wired by default). */
  async deleteOlderThan(days: number): Promise<{ readings: number; notes: number }> {
    const cutoff = new Date(Date.now() - days * 86400000);
    const readings = await this.readingRepo.delete({
      recordedAt: LessThan(cutoff),
    });
    // Keep user-entered notes (manual + Telegram bot) — only prune
    // ring-sourced auto-notes (if any) so user content is never lost.
    const notes = await this.noteRepo.delete({
      recordedAt: LessThan(cutoff),
      source: Not(In(['manual', 'telegram'] as HealthNoteSource[])),
    });
    return {
      readings: readings.affected ?? 0,
      notes: notes.affected ?? 0,
    };
  }
}
