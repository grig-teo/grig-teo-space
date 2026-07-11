import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Not, Repository } from 'typeorm';
import { ContentKey, SiteContent } from '../entities/site-content.entity';
import {
  HealthMetric,
  HEALTH_METRICS,
  HealthReading,
  HealthSource,
} from '../entities/health-reading.entity';
import { HealthNote, HealthNoteSource } from '../entities/health-note.entity';

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
};

export type MetricSeriesPoint = {
  recordedAt: string;
  value: number;
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

@Injectable()
export class HealthService {
  constructor(
    @InjectRepository(HealthReading)
    private readonly readingRepo: Repository<HealthReading>,
    @InjectRepository(HealthNote)
    private readonly noteRepo: Repository<HealthNote>,
    @InjectRepository(SiteContent)
    private readonly contentRepo: Repository<SiteContent>,
  ) {}

  // --- Ingest -------------------------------------------------------------

  async addReadings(readings: IncomingReading[]): Promise<{ inserted: number }> {
    if (readings.length > MAX_READINGS_PER_REQUEST) {
      throw new RangeError(`Too many readings (max ${MAX_READINGS_PER_REQUEST})`);
    }
    const rows = readings.map((reading) => this.toReadingEntity(reading));
    if (rows.length === 0) {
      return { inserted: 0 };
    }
    const saved = await this.readingRepo.save(rows);
    return { inserted: saved.length };
  }

  async addNote(note: IncomingNote): Promise<HealthNote> {
    const content = note.content?.trim();
    if (!content) {
      throw new RangeError('Note content must not be empty');
    }
    return this.noteRepo.save({
      content: content.slice(0, 4000),
      mood: note.mood?.trim().slice(0, 16) ?? null,
      source: note.source ?? 'manual',
      recordedAt: this.parseDate(note.recordedAt) ?? new Date(),
    });
  }

  private toReadingEntity(reading: IncomingReading): HealthReading {
    if (!HEALTH_METRICS.includes(reading.metric)) {
      throw new RangeError(`Unknown metric: ${reading.metric}`);
    }
    const recordedAt = this.parseDate(reading.recordedAt) ?? new Date();
    return {
      id: undefined as unknown as string,
      metric: reading.metric,
      value: Number(reading.value),
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
    const alerts = this.detectAlerts(readings);

    return {
      windowDays: days,
      from: from.toISOString(),
      to: to.toISOString(),
      metrics,
      notesCount,
      alerts,
    };
  }

  async getOverview(days: number): Promise<HealthOverview> {
    const { from, to } = this.window(days);
    const [readings, notes, alerts] = await Promise.all([
      this.readingRepo.find({
        where: { recordedAt: MoreThan(from) },
        order: { recordedAt: 'ASC' },
      }),
      this.noteRepo.find({
        where: { recordedAt: MoreThan(from) },
        order: { recordedAt: 'DESC' },
        take: 200,
      }),
      this.detectAlerts(
        await this.readingRepo.find({
          where: { recordedAt: MoreThan(from) },
          order: { recordedAt: 'ASC' },
        }),
      ),
    ]);

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
    };
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
    const notes = await this.noteRepo.delete({
      recordedAt: LessThan(cutoff),
      source: Not('manual'),
    });
    return {
      readings: readings.affected ?? 0,
      notes: notes.affected ?? 0,
    };
  }
}
