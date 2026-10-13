import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/locale';

export const routing = defineRouting({
  locales: [...LOCALES],
  defaultLocale: DEFAULT_LOCALE,
  // The locale always comes from the URL path, so the cookie is redundant —
  // and a Set-Cookie on every response forces `cache-control: no-store`,
  // defeating page/ISR caching.
  localeCookie: false,
});
