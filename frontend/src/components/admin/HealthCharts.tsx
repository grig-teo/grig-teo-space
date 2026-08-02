'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { HealthMetric, HealthOverview } from '@/lib/admin-api';

const METRIC_LABELS: Record<HealthMetric, string> = {
  heart_rate: 'Heart Rate',
  spo2: 'Blood Oxygen (SpO₂)',
  steps: 'Steps',
  calories: 'Calories',
  distance_km: 'Distance',
  stress: 'Stress',
  hrv: 'Heart Rate Variability',
  sleep_duration_h: 'Sleep Duration',
  sleep_quality: 'Sleep Quality',
  body_temperature: 'Body Temperature',
};

const METRIC_UNIT: Record<HealthMetric, string> = {
  heart_rate: 'bpm',
  spo2: '%',
  steps: '',
  calories: 'kcal',
  distance_km: 'km',
  stress: '',
  hrv: 'ms',
  sleep_duration_h: 'h',
  sleep_quality: '%',
  body_temperature: '°C',
};

// Metrics rendered as a continuous line vs. a daily bar.
const LINE_METRICS: HealthMetric[] = [
  'heart_rate',
  'spo2',
  'hrv',
  'stress',
  'sleep_quality',
  'body_temperature',
];
const BAR_METRICS: HealthMetric[] = ['steps', 'calories', 'distance_km', 'sleep_duration_h'];

const ACCENT = 'rgb(var(--color-accent))'; // matches --color-accent

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Aggregates per-metric series into daily totals (for bar charts). */
function toDailyTotals(
  series: { recordedAt: string; value: number }[],
): { label: string; value: number }[] {
  const byDay = new Map<string, number>();
  for (const point of series) {
    const day = new Date(point.recordedAt).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + point.value);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ label: formatDay(day), value: Math.round(value) }));
}

function MetricCard({
  metric,
  summary,
  series,
}: {
  metric: HealthMetric;
  summary: HealthOverview['metrics'][number];
  series: { recordedAt: string; value: number }[];
}) {
  const unit = METRIC_UNIT[metric];
  const unitStr = unit ? ` ${unit}` : '';
  const isLine = LINE_METRICS.includes(metric);
  const data = isLine
    ? series.map((p) => ({ label: formatTime(p.recordedAt), value: p.value }))
    : toDailyTotals(series);

  if (series.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-mono text-sm text-foreground">{METRIC_LABELS[metric]}</h3>
        <p className="mt-8 mb-8 text-center font-mono text-xs text-muted">No data</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-mono text-sm text-foreground">{METRIC_LABELS[metric]}</h3>
        <span className="font-mono text-xs text-muted">
          avg {summary.avg ?? '—'}
          {unitStr}
          {summary.min !== null && summary.max !== null
            ? ` · ${summary.min}–${summary.max}`
            : ''}
        </span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          {isLine ? (
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="rgb(var(--color-border) / 0.4)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--color-muted))' }} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--color-muted))' }} tickLine={false} width={36} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{
                  background: 'rgb(var(--color-background))',
                  border: '1px solid rgb(var(--color-border))',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'rgb(var(--color-muted))' }}
              />
              <Line type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="rgb(var(--color-border) / 0.4)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--color-muted))' }} tickLine={false} minTickGap={8} />
              <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--color-muted))' }} tickLine={false} width={36} />
              <Tooltip
                contentStyle={{
                  background: 'rgb(var(--color-background))',
                  border: '1px solid rgb(var(--color-border))',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'rgb(var(--color-muted))' }}
              />
              <Bar dataKey="value" fill={ACCENT} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function HealthCharts({ overview }: { overview: HealthOverview }) {
  const ordered = [...overview.metrics].sort((a, b) => {
    const aIdx = LINE_METRICS.includes(a.metric) ? 0 : 1;
    const bIdx = LINE_METRICS.includes(b.metric) ? 0 : 1;
    return aIdx - bIdx;
  });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {ordered.map((m) => (
        <MetricCard
          key={m.metric}
          metric={m.metric}
          summary={m}
          series={m.series}
        />
      ))}
      {overview.metrics.length === 0 && (
        <p className="col-span-full font-mono text-sm text-muted">No metrics collected yet.</p>
      )}
      {ordered.some((m) => BAR_METRICS.includes(m.metric)) === false &&
        ordered.some((m) => LINE_METRICS.includes(m.metric)) === false && null}
    </div>
  );
}

export { METRIC_LABELS, METRIC_UNIT };
