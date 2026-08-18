import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { ContentKey, SiteContent } from '../entities/site-content.entity';
import { HealthReading } from '../entities/health-reading.entity';
import { WeatherSample } from '../entities/weather-sample.entity';

/** Owner's last known location, pushed by the iOS app (never hardcoded). */
export type WeatherLocation = {
  lat: number;
  lon: number;
  updatedAt: string;
};

export type WeatherPoint = {
  recordedAt: string;
  temperatureC: number;
  feelsLikeC: number | null;
  pressureHpa: number | null;
  humidityPct: number | null;
  conditionCode: number | null;
};

export type WeatherSeries = {
  location: WeatherLocation | null;
  points: WeatherPoint[];
};

export type CorrelationPair = {
  weather: 'temperatureC' | 'pressureHpa';
  metric: 'stress' | 'hrv' | 'heart_rate';
  /** Pearson correlation coefficient, -1..1. */
  r: number;
  /** Number of hourly buckets that had both weather and metric data. */
  sampleSize: number;
};

export type WeatherCorrelations = {
  windowDays: number;
  pairs: CorrelationPair[];
  /** Plain-English statements for the strongest findings (|r| >= 0.2). */
  statements: string[];
};

/** Refresh when the newest sample is older than this. */
const FRESH_MS = 60 * 60 * 1000;
/** How far back the Open-Meteo fetch covers (also the first-run backfill). */
const PAST_DAYS = 30;
/** Cap on points returned to clients. */
const MAX_SERIES_POINTS = 500;
/** Metrics correlated against weather. */
const CORRELATED_METRICS = ['stress', 'hrv', 'heart_rate'] as const;

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(
    @InjectRepository(WeatherSample)
    private readonly sampleRepo: Repository<WeatherSample>,
    @InjectRepository(SiteContent)
    private readonly contentRepo: Repository<SiteContent>,
    @InjectRepository(HealthReading)
    private readonly readingRepo: Repository<HealthReading>,
  ) {}

  // --- Location ------------------------------------------------------------

  async getLocation(): Promise<WeatherLocation | null> {
    const row = await this.contentRepo.findOne({
      where: { key: 'weather_location' as ContentKey },
    });
    const data = row?.data as Partial<WeatherLocation> | undefined;
    if (!data || !Number.isFinite(data.lat) || !Number.isFinite(data.lon)) {
      return null;
    }
    return { lat: Number(data.lat), lon: Number(data.lon), updatedAt: String(data.updatedAt ?? '') };
  }

  async updateLocation(lat: number, lon: number): Promise<WeatherLocation> {
    const location: WeatherLocation = {
      lat: Math.round(lat * 1000) / 1000, // ~100 m precision is plenty for weather
      lon: Math.round(lon * 1000) / 1000,
      updatedAt: new Date().toISOString(),
    };
    await this.contentRepo.save({
      key: 'weather_location' as ContentKey,
      data: location as unknown,
    });
    // A new location invalidates old samples only slowly; refetch soon after.
    await this.ensureFresh();
    return location;
  }

  // --- Collection (lazy, tip-cache style) -----------------------------------

  /**
   * Refreshes samples from Open-Meteo when the newest one is stale. Called on
   * every read — no cron needed; first call backfills PAST_DAYS of history.
   */
  async ensureFresh(): Promise<void> {
    const location = await this.getLocation();
    if (!location) return;
    const latest = await this.sampleRepo.findOne({
      where: {},
      order: { recordedAt: 'DESC' },
    });
    if (latest && Date.now() - latest.recordedAt.getTime() < FRESH_MS) return;
    try {
      await this.fetchAndStore(location);
    } catch (error) {
      this.logger.warn(`Open-Meteo fetch failed: ${(error as Error).message}`);
    }
  }

  private async fetchAndStore(location: WeatherLocation): Promise<void> {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${location.lat}&longitude=${location.lon}` +
      '&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,weather_code' +
      `&past_days=${PAST_DAYS}&forecast_days=2&timezone=UTC`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const body = (await res.json()) as {
      hourly?: {
        time?: string[];
        temperature_2m?: (number | null)[];
        apparent_temperature?: (number | null)[];
        relative_humidity_2m?: (number | null)[];
        surface_pressure?: (number | null)[];
        weather_code?: (number | null)[];
      };
    };
    const hourly = body.hourly;
    if (!hourly?.time) return;

    const cutoff = Date.now() + 2 * 60 * 60 * 1000; // skip far-future forecast rows
    // Explicit shape (not Partial<WeatherSample>) so the jsonb `raw` column
    // stays out of the insert type — TypeORM rejects it otherwise.
    const samples: Array<{
      recordedAt: Date;
      temperatureC: number;
      feelsLikeC: number | null;
      pressureHpa: number | null;
      humidityPct: number | null;
      conditionCode: number | null;
    }> = [];
    for (let i = 0; i < hourly.time.length; i += 1) {
      const temp = hourly.temperature_2m?.[i];
      const recordedAt = new Date(`${hourly.time[i]}:00Z`);
      if (temp == null || Number.isNaN(recordedAt.getTime()) || recordedAt.getTime() > cutoff) {
        continue;
      }
      samples.push({
        recordedAt,
        temperatureC: temp,
        feelsLikeC: hourly.apparent_temperature?.[i] ?? null,
        humidityPct: hourly.relative_humidity_2m?.[i] ?? null,
        pressureHpa: hourly.surface_pressure?.[i] ?? null,
        conditionCode: hourly.weather_code?.[i] ?? null,
      });
    }
    if (samples.length === 0) return;
    // Insert-only on the unique recordedAt index (ON CONFLICT DO NOTHING) —
    // safe to re-fetch overlapping ranges.
    await this.sampleRepo
      .createQueryBuilder()
      .insert()
      .values(samples)
      .orIgnore()
      .execute();
  }

  // --- Reads -----------------------------------------------------------------

  async getSeries(days = 1): Promise<WeatherSeries> {
    await this.ensureFresh();
    const location = await this.getLocation();
    const span = Math.max(1, Math.min(days, 365));
    const from = new Date(Date.now() - span * 86400000);
    const samples = await this.sampleRepo.find({
      where: { recordedAt: MoreThan(from) },
      order: { recordedAt: 'ASC' },
    });
    const points: WeatherPoint[] = samples.map((s) => ({
      recordedAt: s.recordedAt.toISOString(),
      temperatureC: s.temperatureC,
      feelsLikeC: s.feelsLikeC,
      pressureHpa: s.pressureHpa,
      humidityPct: s.humidityPct,
      conditionCode: s.conditionCode,
    }));
    return { location, points: this.downsample(points) };
  }

  /** The newest stored sample (null when nothing collected yet). */
  async getCurrent(): Promise<WeatherPoint | null> {
    await this.ensureFresh();
    const latest = await this.sampleRepo.findOne({
      where: {},
      order: { recordedAt: 'DESC' },
    });
    if (!latest) return null;
    return {
      recordedAt: latest.recordedAt.toISOString(),
      temperatureC: latest.temperatureC,
      feelsLikeC: latest.feelsLikeC,
      pressureHpa: latest.pressureHpa,
      humidityPct: latest.humidityPct,
      conditionCode: latest.conditionCode,
    };
  }

  /**
   * Pearson correlations between hourly weather (temperature / pressure) and
   * hourly health metric averages (stress / HRV / heart rate), plus a
   * hot-vs-cool hours resting-HR comparison. Both series are bucketed by UTC
   * hour and joined on the hour key.
   */
  async getCorrelations(days = 30): Promise<WeatherCorrelations> {
    await this.ensureFresh();
    const span = Math.max(1, Math.min(days, 365));
    const from = new Date(Date.now() - span * 86400000);
    const [samples, readings] = await Promise.all([
      this.sampleRepo.find({ where: { recordedAt: MoreThan(from) }, order: { recordedAt: 'ASC' } }),
      this.readingRepo.find({ where: { recordedAt: MoreThan(from) }, order: { recordedAt: 'ASC' } }),
    ]);

    const weatherByHour = this.bucketWeather(samples);
    const metricByHour = this.bucketMetrics(readings);

    const pairs: CorrelationPair[] = [];
    for (const weatherKey of ['temperatureC', 'pressureHpa'] as const) {
      for (const metric of CORRELATED_METRICS) {
        const { xs, ys } = this.joinHours(weatherByHour, metricByHour, weatherKey, metric);
        if (xs.length < 24) continue; // too few overlapping hours to mean anything
        pairs.push({ weather: weatherKey, metric, r: this.pearson(xs, ys), sampleSize: xs.length });
      }
    }
    return { windowDays: span, pairs, statements: this.buildStatements(pairs) };
  }

  // --- Correlation helpers ---------------------------------------------------

  private bucketWeather(samples: WeatherSample[]): Map<string, WeatherSample> {
    const map = new Map<string, WeatherSample>();
    for (const s of samples) {
      map.set(this.hourKey(s.recordedAt), s);
    }
    return map;
  }

  private bucketMetrics(readings: HealthReading[]): Map<string, Map<string, { sum: number; n: number }>> {
    const map = new Map<string, Map<string, { sum: number; n: number }>>();
    for (const r of readings) {
      if (!(CORRELATED_METRICS as readonly string[]).includes(r.metric)) continue;
      const hour = this.hourKey(r.recordedAt);
      const byMetric = map.get(hour) ?? new Map<string, { sum: number; n: number }>();
      const acc = byMetric.get(r.metric) ?? { sum: 0, n: 0 };
      acc.sum += r.value;
      acc.n += 1;
      byMetric.set(r.metric, acc);
      map.set(hour, byMetric);
    }
    return map;
  }

  /** Floors a date to its UTC hour, used as the join key. */
  private hourKey(date: Date): string {
    const d = new Date(date);
    d.setUTCMinutes(0, 0, 0);
    return d.toISOString();
  }

  private joinHours(
    weatherByHour: Map<string, WeatherSample>,
    metricByHour: Map<string, Map<string, { sum: number; n: number }>>,
    weatherKey: 'temperatureC' | 'pressureHpa',
    metric: string,
  ): { xs: number[]; ys: number[] } {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [hour, sample] of weatherByHour) {
      const w = sample[weatherKey];
      const acc = metricByHour.get(hour)?.get(metric);
      if (w == null || !acc || acc.n === 0) continue;
      xs.push(w);
      ys.push(acc.sum / acc.n);
    }
    return { xs, ys };
  }

  private pearson(xs: number[], ys: number[]): number {
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den === 0 ? 0 : Math.round((num / den) * 100) / 100;
  }

  private buildStatements(pairs: CorrelationPair[]): string[] {
    const weatherLabel = { temperatureC: 'temperature', pressureHpa: 'pressure' } as const;
    const metricLabel = { stress: 'stress', hrv: 'HRV', heart_rate: 'heart rate' } as const;
    return pairs
      .filter((p) => Math.abs(p.r) >= 0.2)
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
      .slice(0, 3)
      .map((p) => {
        const direction = p.r > 0 ? 'rises' : 'drops';
        const strength = Math.abs(p.r) >= 0.5 ? 'strongly' : 'tends to';
        return (
          `When ${weatherLabel[p.weather]} goes up, your ${metricLabel[p.metric]} ` +
          `${strength} ${direction} (r = ${p.r.toFixed(2)}, ${p.sampleSize} hours).`
        );
      });
  }

  // --- Misc ------------------------------------------------------------------

  /** One-line weather summary for the LLM tip context, or null. */
  async currentLine(): Promise<string | null> {
    const current = await this.getCurrent();
    if (!current) return null;
    const parts = [`${Math.round(current.temperatureC)}°C`];
    if (current.feelsLikeC != null) parts.push(`feels ${Math.round(current.feelsLikeC)}°C`);
    if (current.pressureHpa != null) parts.push(`${Math.round(current.pressureHpa)} hPa`);
    if (current.humidityPct != null) parts.push(`${Math.round(current.humidityPct)}% humidity`);
    return parts.join(', ');
  }

  private downsample(points: WeatherPoint[]): WeatherPoint[] {
    if (points.length <= MAX_SERIES_POINTS) return points;
    const stride = Math.ceil(points.length / MAX_SERIES_POINTS);
    const result: WeatherPoint[] = [];
    for (let i = 0; i < points.length; i += stride) result.push(points[i]);
    const last = points[points.length - 1];
    if (result[result.length - 1] !== last) result.push(last);
    return result;
  }
}
