import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { ogLocale } from '@/lib/locale';
import type { Locale } from '@/lib/api';

/**
 * Canonical + hreflang for every configured locale.
 *
 * Derived from `routing.locales` on purpose: several pages used to hardcode
 * en/ru/ro, which silently dropped Spanish from hreflang the day it was added.
 */
export function alternatesFor(locale: Locale, path = ''): Metadata['alternates'] {
  const suffix = path && path !== '/' ? path : '';
  const languages: Record<string, string> = {};
  for (const code of routing.locales) {
    languages[code] = `/${code}${suffix}`;
  }
  languages['x-default'] = `/en${suffix}`;
  return { canonical: `/${locale}${suffix}`, languages };
}

type PageMetaInput = {
  locale: Locale;
  /** Route suffix after the locale, e.g. "/services". Empty for the homepage. */
  path?: string;
  title: string;
  description: string;
  /** Defaults to "website"; use "article" for posts. */
  type?: 'website' | 'article';
  twitterCard?: 'summary' | 'summary_large_image';
};

/** Builds consistent page metadata so canonical/OG/Twitter cannot drift apart. */
export function pageMetadata({
  locale,
  path = '',
  title,
  description,
  type = 'website',
  twitterCard = 'summary_large_image',
}: PageMetaInput): Metadata {
  const suffix = path && path !== '/' ? path : '';
  return {
    title,
    description,
    alternates: alternatesFor(locale, suffix),
    openGraph: {
      title,
      description,
      url: `/${locale}${suffix}`,
      siteName: 'grig-teo',
      locale: ogLocale(locale),
      type,
    },
    twitter: { card: twitterCard, title, description },
  };
}
