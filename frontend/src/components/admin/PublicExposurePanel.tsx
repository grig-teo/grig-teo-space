'use client';

import { useEffect, useState } from 'react';
import {
  adminGetHealthConfig,
  adminSaveHealthConfig,
  type HealthMetric,
  type HealthPublicConfig,
} from '@/lib/admin-api';
import { METRIC_LABELS } from './HealthCharts';

// Curated recommendation per metric — helps the admin decide what to expose.
type Recommendation = 'recommended' | 'optional' | 'personal';
const RECOMMENDATIONS: Record<HealthMetric, Recommendation> = {
  heart_rate: 'recommended',
  spo2: 'recommended',
  steps: 'recommended',
  calories: 'optional',
  distance_km: 'optional',
  stress: 'personal',
  hrv: 'optional',
  sleep_duration_h: 'optional',
  sleep_quality: 'personal',
};

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  recommended: 'Recommended',
  optional: 'Your choice',
  personal: 'Personal',
};

const RECOMMENDATION_HINT: Record<Recommendation, string> = {
  recommended: 'Safe to share; shows general wellness.',
  optional: 'Common on fitness profiles; up to you.',
  personal: 'Sensitive; keep private unless you want to.',
};

const ALL_METRICS: HealthMetric[] = [
  'heart_rate',
  'spo2',
  'steps',
  'calories',
  'distance_km',
  'hrv',
  'stress',
  'sleep_duration_h',
  'sleep_quality',
];

const ACCENT_BTN =
  'rounded bg-accent px-4 py-2 font-mono text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50';
const GHOST_BTN =
  'rounded border border-border px-4 py-2 font-mono text-sm text-muted transition-colors hover:text-foreground';

export function PublicExposurePanel() {
  const [config, setConfig] = useState<HealthPublicConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGetHealthConfig()
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);

  if (!config) {
    return (
      <p className="font-mono text-sm text-muted">
        {error ? `Error: ${error}` : 'Loading public-exposure settings…'}
      </p>
    );
  }

  const toggleMetric = (metric: HealthMetric) => {
    const current = config.metrics[metric];
    setConfig({
      ...config,
      metrics: {
        ...config.metrics,
        [metric]: { show: !current?.show, label: current?.label },
      },
    });
  };

  const setLabel = (metric: HealthMetric, label: string) => {
    const current = config.metrics[metric];
    setConfig({
      ...config,
      metrics: {
        ...config.metrics,
        [metric]: { show: current?.show ?? false, label },
      },
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await adminSaveHealthConfig(config);
      setConfig(result);
      setSavedAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = ALL_METRICS.filter((m) => config.metrics[m]?.show).length;

  return (
    <div className="rounded-lg border border-border bg-background/60 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-mono text-base text-foreground">Public health page</h2>
        <label className="ml-auto flex cursor-pointer items-center gap-2 font-mono text-sm">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="h-4 w-4 accent-[rgb(var(--color-accent))]"
          />
          Enable public page
        </label>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="font-mono text-sm">
          <span className="mb-1 block text-muted">Display name</span>
          <input
            type="text"
            value={config.displayName}
            onChange={(e) => setConfig({ ...config, displayName: e.target.value })}
            className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-sm text-foreground focus:border-accent focus:outline-none"
          />
        </label>
        <label className="font-mono text-sm">
          <span className="mb-1 block text-muted">Window (days)</span>
          <input
            type="number"
            min={1}
            max={365}
            value={config.windowDays}
            onChange={(e) =>
              setConfig({ ...config, windowDays: Number(e.target.value) || 7 })
            }
            className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-sm text-foreground focus:border-accent focus:outline-none"
          />
        </label>
        <div className="font-mono text-sm self-end text-muted">
          {enabledCount} metric{enabledCount === 1 ? '' : 's'} selected
        </div>
      </div>

      <p className="mb-2 font-mono text-xs text-muted">
        Choose what visitors can see on your public health page. Each metric has a
        recommendation to help you decide.
      </p>

      <div className="space-y-2">
        {ALL_METRICS.map((metric) => {
          const entry = config.metrics[metric];
          const rec = RECOMMENDATIONS[metric];
          return (
            <div
              key={metric}
              className="flex flex-wrap items-center gap-3 rounded border border-border p-3"
            >
              <label className="flex cursor-pointer items-center gap-2 font-mono text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={entry?.show ?? false}
                  onChange={() => toggleMetric(metric)}
                  className="h-4 w-4 accent-[rgb(var(--color-accent))]"
                />
                {METRIC_LABELS[metric]}
              </label>
              <span
                className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                  rec === 'recommended'
                    ? 'bg-accent/20 text-accent'
                    : rec === 'optional'
                      ? 'bg-foreground/10 text-muted'
                      : 'bg-foreground/5 text-muted'
                }`}
                title={RECOMMENDATION_HINT[rec]}
              >
                {RECOMMENDATION_LABEL[rec]}
              </span>
              <span className="hidden font-mono text-xs text-muted sm:inline">
                {RECOMMENDATION_HINT[rec]}
              </span>
              {entry?.show && (
                <input
                  type="text"
                  placeholder="Custom label (optional)"
                  value={entry.label ?? ''}
                  onChange={(e) => setLabel(metric, e.target.value)}
                  className="ml-auto w-44 rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground focus:border-accent focus:outline-none"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={saving} className={ACCENT_BTN}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        <button
          onClick={() => window.open('/health', '_blank')}
          className={GHOST_BTN}
          disabled={!config.enabled || enabledCount === 0}
          title={config.enabled ? 'Open the public page' : 'Enable the page first'}
        >
          Preview public page
        </button>
        {savedAt && (
          <span className="font-mono text-xs text-muted">Saved at {savedAt.toLocaleTimeString()}</span>
        )}
        {error && <span className="font-mono text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}
