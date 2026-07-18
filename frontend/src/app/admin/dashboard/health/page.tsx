'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HealthCharts } from '@/components/admin/HealthCharts';
import { PublicExposurePanel } from '@/components/admin/PublicExposurePanel';
import {
  adminGetHealthOverview,
  adminVerify,
  type HealthOverview,
} from '@/lib/admin-api';

type Range = { days: number; label: string };
const RANGES: Range[] = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
];

function AlertStrip({ overview }: { overview: HealthOverview }) {
  if (overview.alerts.length === 0) return null;
  return (
    <div className="rounded-lg border border-red-400/40 bg-red-400/5 p-4">
      <h2 className="mb-2 font-mono text-sm text-red-400">
        ⚠️ Alerts ({overview.alerts.length})
      </h2>
      <ul className="space-y-1 font-mono text-xs text-foreground">
        {overview.alerts.map((a, i) => (
          <li key={i}>
            {a.level === 'critical' ? '🚨' : '⚠️'} {a.message} — {a.value} @{' '}
            {new Date(a.recordedAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotesTimeline({ overview }: { overview: HealthOverview }) {
  if (overview.notes.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-3 font-mono text-base text-foreground">Notes</h2>
      <ul className="space-y-2">
        {overview.notes.map((note) => (
          <li key={note.id} className="flex gap-3 border-b border-border/50 pb-2 last:border-0">
            <span className="font-mono text-xs text-muted">
              {new Date(note.recordedAt).toLocaleString()}
            </span>
            <span className="font-mono text-xs text-foreground">{note.content}</span>
            {note.source === 'telegram' && (
              <span className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                telegram
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminHealthPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<HealthOverview | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    adminVerify().then((ok) => {
      if (!ok) {
        router.replace('/admin');
        return;
      }
      setAuthed(true);
    });
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminGetHealthOverview(days);
      setOverview(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {!authed ? (
        <p className="font-mono text-sm text-muted">Checking access…</p>
      ) : (
        <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="font-mono text-xl text-foreground">Health</h1>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-md px-3 py-1 font-mono text-xs transition-colors ${
                days === r.days
                  ? 'bg-accent text-background'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded border border-border px-3 py-1 font-mono text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-400/40 bg-red-400/5 p-4 font-mono text-sm text-red-400">
          {error}
        </div>
      )}

      {overview && <AlertStrip overview={overview} />}

      <section className="mb-8">
        {overview ? (
          <HealthCharts overview={overview} />
        ) : (
          <p className="font-mono text-sm text-muted">Loading metrics…</p>
        )}
      </section>

      {overview && <NotesTimeline overview={overview} />}

      <section className="mt-8">
        <PublicExposurePanel />
      </section>
        </>
      )}
    </div>
  );
}
