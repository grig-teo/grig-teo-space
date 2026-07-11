import type { HealthSummary } from './backend-client.js';

const METRIC_EMOJI: Record<string, string> = {
  heart_rate: '❤️',
  spo2: '🩸',
  steps: '👟',
  calories: '🔥',
  distance_km: '📏',
  stress: '😣',
  hrv: '💓',
  sleep_duration_h: '😴',
  sleep_quality: '🌙',
};

const METRIC_UNIT: Record<string, string> = {
  heart_rate: 'bpm',
  spo2: '%',
  steps: '',
  calories: 'kcal',
  distance_km: 'km',
  stress: '',
  hrv: 'ms',
  sleep_duration_h: 'h',
  sleep_quality: '%',
};

function fmt(value: number | null, digits = 0): string {
  if (value === null) return '—';
  return value.toFixed(digits);
}

/** Formats the daily digest message (Telegram MarkdownV2-escaped). */
export function formatDigest(summary: HealthSummary, periodLabel: string): string {
  const lines: string[] = [`*📊 Health digest — ${periodLabel}*`, ''];

  const interesting = summary.metrics.filter((m) => m.count > 0);
  if (interesting.length === 0) {
    lines.push('No ring data synced yet for this period.');
  } else {
    for (const m of interesting) {
      const emoji = METRIC_EMOJI[m.metric] ?? '•';
      const unit = METRIC_UNIT[m.metric] ?? '';
      const unitStr = unit ? ` ${unit}` : '';
      const digits = m.metric === 'sleep_duration_h' || m.metric === 'distance_km' ? 1 : 0;
      lines.push(
        `${emoji} *${m.metric.replace(/_/g, ' ')}*: avg ${fmt(m.avg, digits)}${unitStr}` +
          (m.min !== null && m.max !== null
            ? ` \\(${fmt(m.min, digits)}–${fmt(m.max, digits)}${unitStr}\\)`
            : ''),
      );
    }
  }

  if (summary.notesCount > 0) {
    lines.push('');
    lines.push(`📝 ${summary.notesCount} note${summary.notesCount === 1 ? '' : 's'} logged`);
  }

  return lines.join('\n');
}

/** Formats anomaly alerts for immediate forwarding. */
export function formatAlerts(alerts: NonNullable<HealthSummary['alerts']>): string {
  if (alerts.length === 0) return '';
  const lines = ['*⚠️ Health alerts*', ''];
  for (const a of alerts) {
    const icon = a.level === 'critical' ? '🚨' : '⚠️';
    lines.push(`${icon} ${a.message}`);
    lines.push(`   ${a.value} @ ${new Date(a.recordedAt).toLocaleString()}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
