import { Link } from '@/i18n/navigation';
import { getExperienceDetail } from '@/lib/api';
import type { Locale } from '@/lib/api';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ locale: Locale; id: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props) {
  const { locale, id } = await params;

  try {
    const item = await getExperienceDetail(id, locale);
    const t = await getTranslations({ locale, namespace: 'experiencePage' });
    const ogLocale = locale === 'ru' ? 'ru_RU' : locale === 'ro' ? 'ro_RO' : 'en_US';

    return {
      title: t('title', { company: item.company }),
      description: item.summary ?? item.description,
      alternates: {
        canonical: `/${locale}/experience/${id}`,
        languages: Object.fromEntries(
          (['en', 'ru', 'ro'] as Locale[]).map((alt) => [alt, `/${alt}/experience/${id}`]),
        ),
      },
      openGraph: {
        title: t('title', { company: item.company }),
        description: item.summary ?? item.description,
        url: `/${locale}/experience/${id}`,
        siteName: 'grig-teo',
        locale: ogLocale,
        type: 'article',
      },
    };
  } catch {
    return {};
  }
}

export default async function ExperienceDetailPage({ params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'experiencePage' });

  let item;
  try {
    item = await getExperienceDetail(id, locale);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen">
      <section className="px-4 py-8 sm:px-6 sm:py-12 md:px-12">
        <Link
          href="/#experience"
          className="mb-6 inline-block text-sm text-accent hover:underline underline-offset-4 sm:mb-8"
        >
          {t('back')}
        </Link>

        <div className="max-w-3xl">
          <time className="text-xs text-muted">{item.period}</time>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            <span className="text-accent">{item.role}</span>
            <span className="text-muted"> @ </span>
            {item.companyUrl ? (
              <a
                href={item.companyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-accent"
              >
                {item.company}
              </a>
            ) : (
              <span>{item.company}</span>
            )}
          </h1>

          {item.summary && (
            <p className="mt-6 text-sm leading-relaxed text-muted">{item.summary}</p>
          )}

          {item.highlights.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-4 text-xs uppercase tracking-wide text-accent">
                {t('highlights')}
              </h2>
              <ul className="space-y-3">
                {item.highlights.map((highlight) => (
                  <li key={highlight} className="text-sm leading-relaxed text-muted">
                    <span className="text-accent">—</span> {highlight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {item.stack && (
            <div className="mt-8 border border-border p-4">
              <h2 className="mb-2 text-xs uppercase tracking-wide text-accent">{t('stack')}</h2>
              <p className="text-sm leading-relaxed text-muted">{item.stack}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
