import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { BlogBodyViewer } from '@/components/BlogBodyViewer';
import { Link } from '@/i18n/navigation';
import { getBlogPost, getProfile } from '@/lib/api';
import type { Locale } from '@/lib/api';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ locale: Locale; id: string }>;
};

export const dynamic = 'force-dynamic';

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export async function generateMetadata({ params }: Props) {
  const { locale, id } = await params;

  try {
    const post = await getBlogPost(id, locale);
    const t = await getTranslations({ locale, namespace: 'blogPage' });
    const ogLocale = locale === 'ru' ? 'ru_RU' : locale === 'ro' ? 'ro_RO' : 'en_US';

    return {
      title: t('articleTitle', { title: post.title }),
      description: post.excerpt,
      alternates: {
        canonical: `/${locale}/blog/${id}`,
        languages: Object.fromEntries(
          (['en', 'ru', 'ro'] as Locale[]).map((alt) => [alt, `/${alt}/blog/${id}`]),
        ),
      },
      openGraph: {
        title: post.title,
        description: post.excerpt,
        url: `/${locale}/blog/${id}`,
        siteName: 'grig-teo',
        locale: ogLocale,
        type: 'article',
      },
    };
  } catch {
    return {};
  }
}

export default async function BlogArticlePage({ params }: Props) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'blogPage' });

  let post;
  let profile;
  try {
    [post, profile] = await Promise.all([getBlogPost(id, locale), getProfile(locale)]);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen">
      <Header />
      <section className="px-4 py-8 sm:px-6 sm:py-12 md:px-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex flex-col gap-4 sm:mb-10">
            <Link
              href="/blog"
              className="inline-block text-sm text-accent hover:underline underline-offset-4"
            >
              {t('backToArticles')}
            </Link>

            <time className="text-xs text-muted">{formatDate(post.publishedAt, locale)}</time>
          </div>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{post.title}</h1>
          {post.excerpt ? (
            <p className="mt-6 text-sm leading-relaxed text-muted">{post.excerpt}</p>
          ) : null}

          <div className="mt-8 border-t border-border pt-8">
            <BlogBodyViewer key={post.body} body={post.body} />
          </div>
        </div>
      </section>
      <Footer profile={profile} />
    </main>
  );
}
