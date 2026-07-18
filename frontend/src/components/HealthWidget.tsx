'use client';

import { useTranslations } from 'next-intl';
import { HealthScene } from '@/components/HealthScene';
import type { PublicHealthMetric, PublicHealthPayload } from '@/lib/api';

const ACCENT = 'rgb(var(--color-accent))';

/** Tiny inline SVG sparkline — no chart lib needed on the public page. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const width = 120;
  const height = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((value, i) => {
      const x = i * step;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} className="opacity-80" aria-hidden>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function MetricCard({ metric }: { metric: PublicHealthMetric }) {
  const t = useTranslations('health');
  const unit = metric.unit ? ` ${metric.unit}` : '';
  const seriesValues = metric.series.map((p) => p.value);
  const digits = metric.metric === 'sleep_duration_h' || metric.metric === 'distance_km' ? 1 : 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="font-mono text-xs uppercase tracking-wide text-muted">{metric.label}</h3>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-2xl text-foreground">
          {metric.summary.avg !== null ? metric.summary.avg.toFixed(digits) : '—'}
        </span>
        {unit && <span className="font-mono text-xs text-muted">{metric.unit}</span>}
      </div>
      {seriesValues.length > 1 && (
        <div className="mt-2">
          <Sparkline data={seriesValues} color={ACCENT} />
        </div>
      )}
      <p className="mt-1 font-mono text-[11px] text-muted">
        {t('avg')} {metric.summary.avg ?? '—'}{unit}
        {metric.summary.min !== null && metric.summary.max !== null
          ? ` · ${metric.summary.min}–${metric.summary.max}`
          : ''}
      </p>
    </div>
  );
}

export function HealthWidget({ payload }: { payload: PublicHealthPayload }) {
  const t = useTranslations('health');
  return (
    <section id="health" className="relative overflow-hidden px-4 py-16 sm:px-6 md:px-12">
      {payload.metrics.length > 0 && <HealthScene payload={payload} />}
      <div className="relative mx-auto max-w-5xl">
        <div className="mb-6">
          <p className="font-mono text-xs text-accent">{t('lastDays', { days: payload.windowDays })}</p>
          <h2 className="mt-1 font-mono text-2xl text-foreground">{payload.displayName}</h2>
          <p className="mt-1 font-mono text-sm text-muted">{t('description')}</p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {payload.metrics.map((metric) => (
            <MetricCard key={metric.metric} metric={metric} />
          ))}
        </div>
        {payload.metrics.length === 0 && (
          <p className="font-mono text-sm text-muted">{t('noData')}</p>
        )}
      </div>
    </section>
  );
}
