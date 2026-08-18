/**
 * Thin typed HTTP client for the backend health endpoints.
 * The bot never touches the database directly — it goes through the same
 * REST API as the iOS app, authenticated with the shared device key.
 */

export type HealthMetric =
  | 'heart_rate'
  | 'spo2'
  | 'steps'
  | 'calories'
  | 'distance_km'
  | 'stress'
  | 'hrv'
  | 'sleep_duration_h'
  | 'sleep_quality';

export type IncomingReading = {
  metric: HealthMetric;
  value: number;
  unit?: string | null;
  recordedAt: string;
  source?: 'ring' | 'manual' | 'demo';
  raw?: Record<string, unknown>;
};

export type MetricSummary = {
  metric: HealthMetric;
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  latest: { recordedAt: string; value: number } | null;
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

export type HourlyTip = {
  tip: string | null;
  generatedAt: string;
  skippedReason?: string;
};

export class BackendClient {
  private readonly baseUrl: string;
  private readonly deviceKey: string;

  constructor(baseUrl: string, deviceKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.deviceKey = deviceKey;
  }

  async addReadings(readings: IncomingReading[]): Promise<{ inserted: number }> {
    return this.request<{ inserted: number }>('/api/health/readings', {
      method: 'POST',
      body: JSON.stringify({ readings }),
    });
  }

  async addNote(content: string, mood?: string): Promise<{ id: string }> {
    return this.request<{ id: string }>('/api/health/notes', {
      method: 'POST',
      body: JSON.stringify({ content, mood, source: 'telegram' }),
    });
  }

  async getSummary(days = 1): Promise<HealthSummary> {
    return this.request<HealthSummary>(`/api/health/summary?days=${days}`, {
      method: 'GET',
    });
  }

  async getHourlyTip(): Promise<HourlyTip> {
    return this.request<HourlyTip>('/api/health/tip', { method: 'GET' });
  }

  /** LLM weekly digest (cached server-side, shared with the iOS app). */
  async getWeeklyDigest(): Promise<{ text: string }> {
    return this.request<{ text: string }>('/api/health/digest', { method: 'GET' });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': this.deviceKey,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Backend ${res.status} for ${path}: ${body.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }
}
