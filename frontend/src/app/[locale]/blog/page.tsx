import { BlogList } from '@/components/Blog';
import { Link } from '@/i18n/navigation';
import { getBlogPosts } from '@/lib/api';
import type { Locale } from '@/lib/api';
import { getTranslations } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'blogPage' });
  const ogLocale = locale === 'ru' ? 'ru_RU' : locale === 'ro' ? 'ro_RO' : 'en_US';

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}/blog`,
      languages: {
        en: '/en/blog',
        ru: '/ru/blog',
        ro: '/ro/blog',
        'x-default': '/en/blog',
      },
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `/${locale}/blog`,
      siteName: 'grig-teo',
      locale: ogLocale,
      type: 'website',
    },
  };
}

export default async function BlogPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'blogPage' });

  const posts = await getBlogPosts(locale);

  return (
    <main className="min-h-screen">
      <section className="px-4 py-8 sm:px-6 sm:py-12 md:px-12">
        <Link
          href="/#blog"
          className="mb-6 inline-block font-mono text-sm text-accent hover:underline underline-offset-4 sm:mb-8"
        >
          {t('back')}
        </Link>
        <h1 className="mb-3 font-mono text-2xl font-bold sm:text-3xl">{t('heading')}</h1>
        <p className="mb-8 max-w-2xl font-sans text-sm text-muted sm:mb-12">{t('description')}</p>
        {posts.length > 0 ? (
          <BlogList posts={posts} locale={locale} />
        ) : (
          <p className="text-sm text-muted">{t('empty')}</p>
        )}
      </section>
    </main>
  );
}
