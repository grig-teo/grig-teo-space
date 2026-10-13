/**
 * The site's locales, in switcher order.
 *
 * Single source of truth: the i18n routing, the locale type and the Open Graph
 * locale codes all derive from this, so adding a language is one edit here plus
 * a messages file.
 */
export const LOCALES = ['en', 'ru', 'ro', 'es'] as const;

/** Default locale: English, used when the URL carries an unknown or no locale. */
export const DEFAULT_LOCALE = 'en';

export type Locale = (typeof LOCALES)[number];

/** Open Graph wants a territory-qualified tag, unlike the bare URL segment. */
const OG_LOCALES: Record<Locale, string> = {
  en: 'en_US',
  ru: 'ru_RU',
  ro: 'ro_RO',
  es: 'es_ES',
};

export function ogLocale(locale: Locale): string {
  return OG_LOCALES[locale] ?? OG_LOCALES[DEFAULT_LOCALE];
}

/**
 * Localized-value builders.
 *
 * Building `{ en: '', ru: '', ro: '' }` by hand is what made adding a language a
 * hunt through the admin editor, so these derive every locale from LOCALES.
 */
export function localizedFrom(value?: Partial<Record<Locale, string>>): Record<Locale, string> {
  return Object.fromEntries(LOCALES.map((code) => [code, value?.[code] ?? ''])) as Record<Locale, string>;
}

/** The same string in every locale, for values a migration left un-translated. */
export function localizedAll(value: string): Record<Locale, string> {
  return localizedFrom(Object.fromEntries(LOCALES.map((code) => [code, value])));
}

/** An empty list per locale. */
export function localizedList(): Record<Locale, string[]> {
  return Object.fromEntries(LOCALES.map((code) => [code, [] as string[]])) as Record<Locale, string[]>;
}
