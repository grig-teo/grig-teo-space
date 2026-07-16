'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import type { Locale } from '@/lib/api';

const locales: { code: Locale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'ro', label: 'RO' },
];

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (next: Locale) => {
    const segments = pathname.split('/');
    segments[1] = next;
    router.push(segments.join('/') || `/${next}`);
  };

  return (
    <div
      className={`flex shrink-0 gap-1 rounded border border-border px-2 py-1 font-mono text-xs text-muted transition-colors hover:border-accent ${className}`}
    >
      {locales.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => switchLocale(code)}
          className={`rounded-sm px-2 py-0.5 transition-colors ${
            locale === code ? 'bg-accent text-background' : 'text-muted hover:text-accent'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
