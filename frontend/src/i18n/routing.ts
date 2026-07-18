import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'ru', 'ro'],
  defaultLocale: 'en',
  // The locale always comes from the URL path, so the cookie is redundant —
  // and a Set-Cookie on every response forces `cache-control: no-store`,
  // defeating page/ISR caching.
  localeCookie: false,
});
