'use client';

import { useTranslations } from 'next-intl';
import type { ExperienceItem } from '@/lib/api';

export function Experience({ items }: { items: ExperienceItem[] }) {
  const t = useTranslations('sections');

  return (
    <section id="experience" className="px-6 py-16 md:px-12">
      <h2 className="mb-10 text-lg">{t('experience')}</h2>
      <div className="relative max-w-4xl">
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
        <div className="space-y-10">
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-[12px_1fr] gap-x-6">
              <div className="flex justify-center pt-1">
                <span className="relative z-10 size-3 rounded-full border-2 border-accent bg-background" />
              </div>
              <article>
                <div className="mb-1 flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
                  <time className="min-w-[120px] text-xs text-muted">{item.period}</time>
                  <h3 className="text-sm">
                    <span className="text-accent">{item.role}</span>
                    <span className="text-muted"> @ {item.company}</span>
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.description}</p>
              </article>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
