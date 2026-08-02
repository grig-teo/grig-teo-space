import type { PublicHealthPayload } from '@/lib/api';

export type HealthVitals = {
  bpm?: number;
  cadence?: number;
  stepsToday?: number;
  stress?: number;
};

/** Sums the step readings recorded on the current UTC day. */
function sumTodaySteps(series: { recordedAt: string; value: number }[]): number {
  const today = new Date().toISOString().slice(0, 10);
  const total = series
    .filter((point) => point.recordedAt.slice(0, 10) === today)
    .reduce((sum, point) => sum + point.value, 0);
  return Math.round(total);
}

/** Derives the hero vitals from the public health payload. Shared by the
 *  SSR first paint and the live client-side refresh. */
export function computeVitals(health: PublicHealthPayload | null): HealthVitals {
  if (!health) return {};

  const avgBpm = health.metrics.find((m) => m.metric === 'heart_rate')?.summary.avg;
  const avgStress = health.metrics.find((m) => m.metric === 'stress')?.summary.avg;
  const stepsMetric = health.metrics.find((m) => m.metric === 'steps');
  // Map the steps average to a plausible stride cadence (0.9–2.2 strides/s).
  const avgSteps = stepsMetric?.summary.avg;

  return {
    bpm: avgBpm ? Math.round(avgBpm) : undefined,
    cadence: avgSteps ? Math.min(Math.max(avgSteps * 0.06, 0.9), 2.2) : undefined,
    stepsToday: stepsMetric ? sumTodaySteps(stepsMetric.series) : undefined,
    stress: avgStress != null ? Math.min(Math.max(Math.round(avgStress), 0), 100) : undefined,
  };
}
