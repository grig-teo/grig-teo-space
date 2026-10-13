'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { LOCALES, type Locale } from '@/lib/locale';

/** Endonyms: each language named in itself, which is what readers recognise. */
const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
  ro: 'Română',
  es: 'Español',
};

/** Language picker. A native select keeps it keyboard- and mobile-friendly. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (next: Locale) => {
    if (next === locale) return;
    const segments = pathname.split('/');
    segments[1] = next;
    router.push(segments.join('/') || `/${next}`);
  };

  return (
    <div className={`relative shrink-0 ${className}`}>
      <select
        aria-label="Language"
        value={locale}
        onChange={(event) => switchLocale(event.target.value as Locale)}
        className="cursor-pointer appearance-none rounded border border-border bg-background py-1 pl-2 pr-6 font-mono text-xs text-muted outline-none transition-colors hover:border-accent hover:text-accent focus:border-accent"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} className="bg-background text-foreground">
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-muted"
      >
        ▼
      </span>
    </div>
  );
}
