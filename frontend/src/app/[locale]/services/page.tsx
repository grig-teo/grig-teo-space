import { JsonLd, ServicesJsonLd } from '@/components/JsonLd';
import { ServicesList } from '@/components/Services';
import { Link } from '@/i18n/navigation';
import { getProfile, type Locale } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'servicesPage' });
  return pageMetadata({
    locale,
    path: '/services',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

export default async function ServicesPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'servicesPage' });
  const profile = await getProfile(locale);
  const items = t.raw('items') as { title: string; summary: string }[];

  return (
    <main className="min-h-screen">
      <JsonLd profile={profile} locale={locale} />
      <ServicesJsonLd
        providerName={profile.name}
        providerUrl={`https://grig-teo.space/${locale}/services`}
        catalogName={t('heading')}
        services={items.map((item) => ({ name: item.title, description: item.summary }))}
      />
      <section className="px-4 py-12 sm:px-6 sm:py-16 md:px-12">
        <div className="max-w-5xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">{t('eyebrow')}</p>
          <h1 className="mt-3 font-mono text-3xl font-bold leading-tight sm:text-4xl">
            {t('heading')}
          </h1>
          <p className="mt-4 max-w-2xl font-sans text-base leading-relaxed text-muted">
            {t('lead')}
          </p>

          <div className="mt-10">
            <ServicesList />
          </div>

          <div className="mt-12 rounded-lg border border-accent/40 bg-surface p-6 sm:p-8">
            <h2 className="font-mono text-lg font-bold text-foreground">{t('ctaTitle')}</h2>
            <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-muted">
              {t('ctaBody')}
            </p>
            <Link
              href="/contact"
              className="mt-5 inline-block rounded bg-accent px-5 py-2.5 font-mono text-sm text-background hover:opacity-90"
            >
              {t('ctaButton')}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
