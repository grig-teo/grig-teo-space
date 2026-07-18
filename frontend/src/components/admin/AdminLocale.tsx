'use client';

import type { Locale } from '@/lib/admin-api';
import { createContext, useContext, useState, type ReactNode } from 'react';

const locales: Locale[] = ['ro', 'ru', 'en'];
const localeLabels: Record<Locale, string> = { ro: 'ro', ru: 'ру', en: 'en' };

const AdminLocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
}>({ locale: 'en', setLocale: () => {} });

export function useAdminLocale() {
  return useContext(AdminLocaleContext);
}

export function AdminLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  return (
    <AdminLocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </AdminLocaleContext.Provider>
  );
}

export function AdminLocaleSwitcher() {
  const { locale, setLocale } = useAdminLocale();
  return (
    <div className="flex gap-1 rounded-lg border border-border p-0.5">
      {locales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => setLocale(loc)}
          className={`rounded-md px-2.5 py-1 font-mono text-xs transition-colors ${
            locale === loc ? 'bg-accent text-background' : 'text-muted hover:text-foreground'
          }`}
        >
          {localeLabels[loc]}
        </button>
      ))}
    </div>
  );
}
