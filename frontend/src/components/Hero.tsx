'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { HealthScene } from '@/components/HealthScene';
import { StressScene } from '@/components/StressScene';
import { WalkerScene } from '@/components/WalkerScene';
import type { Profile, PublicHealthPayload } from '@/lib/api';
import { computeVitals, type HealthVitals } from '@/lib/health-vitals';
import { useEffect, useState } from 'react';

/** How often the hero vitals refetch from the server (ms). */
const VITALS_REFRESH_MS = 60_000;

export type HeroStats = {
  years: number;
  roles: number;
  products: number;
  articles: number;
};

/** Only the identity fields the hero renders — never pass the full profile
 *  (its `about` bio must stay out of the landing page's serialized props). */
export type HeroProfile = Pick<Profile, 'name' | 'title' | 'location'>;

function TerminalCard({ profile }: { profile: HeroProfile }) {
  const t = useTranslations('hero');

  return (
    <div className="rounded-lg border border-border bg-surface font-mono">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="size-3 rounded-full bg-red-400" aria-hidden />
        <span className="size-3 rounded-full bg-amber-400" aria-hidden />
        <span className="size-3 rounded-full bg-green-400" aria-hidden />
        <span className="ml-2 text-xs text-muted">{t('prompt')}</span>
      </div>
      <div className="px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-sm text-muted">{t('whoami')}</p>
        <h1 className="mt-3 font-mono text-4xl font-bold text-foreground md:text-6xl">
          {profile.name}
        </h1>
        <p className="mt-3 text-accent">{profile.title}</p>
        <p className="mt-1 text-sm text-muted">{profile.location}</p>
      </div>
    </div>
  );
}

function StatsStrip({ stats }: { stats: HeroStats }) {
  const t = useTranslations('hero.stats');
  const cells = [
    t('years', { value: stats.years }),
    t('roles', { value: stats.roles }),
    t('products', { value: stats.products }),
    t('articles', { value: stats.articles }),
  ];

  return (
    <div className="grid grid-cols-2 divide-x divide-border rounded-lg border border-border bg-surface md:grid-cols-4">
      {cells.map((cell, index) => (
        <div key={index} className="px-4 py-3 text-center font-mono text-lg text-accent">
          {cell}
        </div>
      ))}
    </div>
  );
}

function DomainChips() {
  const t = useTranslations('hero');
  const domains = t('domains')
    .split('·')
    .map((domain) => domain.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-wrap gap-2">
      {domains.map((domain) => (
        <span
          key={domain}
          className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted"
        >
          {domain}
        </span>
      ))}
    </div>
  );
}

function HeroCtas() {
  const t = useTranslations('hero');

  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href="/#projects"
        className="rounded bg-accent px-5 py-2.5 font-mono text-sm text-background hover:opacity-90"
      >
        {t('ctaProjects')}
      </Link>
      <Link
        href="/#contact"
        className="rounded border border-border px-5 py-2.5 font-mono text-sm text-muted hover:border-accent hover:text-accent"
      >
        {t('ctaContact')}
      </Link>
    </div>
  );
}

export function Hero({
  profile,
  stats,
  initialVitals,
}: {
  profile: HeroProfile;
  stats: HeroStats;
  /** SSR first-paint vitals; the hero then refetches `/api/health/public`
   *  every minute so the figures track the server instead of the cached
   *  page render. */
  initialVitals: HealthVitals;
}) {
  const [vitals, setVitals] = useState<HealthVitals>(initialVitals);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch('/api/health/public', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as PublicHealthPayload;
        if (!cancelled) {
          // If public health was disabled between polls, clear the figures
          // instead of leaving stale values on screen.
          setVitals(data.enabled ? computeVitals(data) : {});
        }
      } catch {
        // Keep the last good values on network errors.
      }
    }

    refresh();
    const timer = window.setInterval(refresh, VITALS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const { bpm, cadence, stepsToday, stress } = vitals;
  return (
    <section id="about" className="px-4 py-20 sm:px-6 md:px-12 md:py-28">
      <div className="max-w-6xl lg:grid lg:grid-cols-[1fr_auto] lg:items-start lg:gap-12">
        <div>
          <TerminalCard profile={profile} />
          <div className="mt-8">
            <StatsStrip stats={stats} />
          </div>
          <div className="mt-6">
            <DomainChips />
          </div>
          <div className="mt-8">
            <HeroCtas />
          </div>
        </div>
        <div className="mt-10 flex justify-center lg:mt-0 lg:pt-4">
          <div className="flex scale-90 items-center gap-12 lg:scale-100">
            {bpm ? <HealthScene bpm={bpm} /> : null}
            {cadence ? (
              <div className="flex flex-col items-center gap-1">
                <WalkerScene cadence={cadence} />
                {stepsToday !== undefined && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    {stepsToday} steps today
                  </span>
                )}
              </div>
            ) : null}
            {stress !== undefined ? <StressScene stress={stress} /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
