import { HealthWidget } from '@/components/HealthWidget';
import { Link } from '@/i18n/navigation';
import { getPublicHealth } from '@/lib/api';
import type { Locale } from '@/lib/api';
import { getTranslations } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'health' });
  const ogLocale = locale === 'ru' ? 'ru_RU' : locale === 'ro' ? 'ro_RO' : 'en_US';

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}/health`,
      languages: {
        en: '/en/health',
        ru: '/ru/health',
        ro: '/ro/health',
        'x-default': '/en/health',
      },
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `/${locale}/health`,
      siteName: 'grig-teo',
      locale: ogLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: t('title'),
      description: t('description'),
    },
  };
}

export default async function HealthPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'health' });
  // health.* has no back-link key; reuse the identical projectsPage.back label.
  const tProjects = await getTranslations({ locale, namespace: 'projectsPage' });

  const health = await getPublicHealth();

  return (
    <main className="min-h-screen">
      <section className="px-4 py-8 sm:px-6 sm:py-12 md:px-12">
        <Link
          href="/"
          className="mb-6 inline-block font-mono text-sm text-accent hover:underline underline-offset-4 sm:mb-8"
        >
          {tProjects('back')}
        </Link>
        {!health ? (
          <p className="max-w-2xl font-mono text-sm text-muted">{t('notAvailable')}</p>
        ) : (
          <HealthWidget payload={health} />
        )}
      </section>
    </main>
  );
}
