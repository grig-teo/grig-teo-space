'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { ExperienceItem } from '@/lib/api';

/** Founder roles (role contains "Founder", case-insensitive) get the amber era treatment. */
function isFounderRole(role: string): boolean {
  return role.toLowerCase().includes('founder');
}

function EraChip({ founder }: { founder: boolean }) {
  const t = useTranslations('sections');

  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
        founder ? 'border-accent-2/50 text-accent-2' : 'border-border text-muted'
      }`}
    >
      {founder ? t('eraFounder') : t('eraIndustry')}
    </span>
  );
}

function ExperienceRow({ item }: { item: ExperienceItem }) {
  const t = useTranslations('sections');
  const founder = isFounderRole(item.role);

  return (
    <div className="grid grid-cols-[12px_1fr] gap-x-4 sm:gap-x-6">
      <div className="flex justify-center pt-1">
        <span
          className={`relative z-10 size-3 rounded-full border-2 bg-background ${
            founder ? 'border-accent-2' : 'border-accent'
          }`}
        />
      </div>
      <article>
        <div className="mb-1 flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
          <span className="flex items-center gap-2 md:min-w-[120px]">
            <time className="font-mono text-xs text-muted">{item.period}</time>
            <EraChip founder={founder} />
          </span>
          <h3 className="break-words font-mono text-sm">
            <span className="text-accent">{item.role}</span>
            <span className="text-muted"> @ </span>
            {item.companyUrl ? (
              <a
                href={item.companyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted underline decoration-border underline-offset-4 transition-colors hover:text-accent"
              >
                {item.company}
              </a>
            ) : (
              <span className="text-muted">{item.company}</span>
            )}
          </h3>
        </div>
        <p className="mt-2 font-sans text-sm leading-relaxed text-muted">{item.description}</p>
        <Link
          href={`/experience/${item.id}`}
          className="mt-2 inline-block font-mono text-sm text-accent hover:underline underline-offset-4"
        >
          {t('readMore')}
        </Link>
      </article>
    </div>
  );
}

export function Experience({ items }: { items: ExperienceItem[] }) {
  const t = useTranslations('sections');

  return (
    <section id="experience" className="px-4 py-12 sm:px-6 sm:py-16 md:px-12">
      <h2 className="mb-8 font-mono text-sm text-muted sm:mb-10">
        <span className="text-accent">##</span> {t('experience')}
      </h2>
      <div className="relative max-w-4xl">
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
        <div className="space-y-8 sm:space-y-10">
          {items.map((item) => (
            <ExperienceRow key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
