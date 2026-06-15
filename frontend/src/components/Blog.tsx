'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { BlogPost } from '@/lib/api';

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function BlogCard({ post, locale }: { post: BlogPost; locale: string }) {
  const t = useTranslations('sections');

  return (
    <article className="group flex h-full flex-col border border-border p-4 transition-colors hover:border-accent sm:p-6">
      <time className="text-xs text-muted">{formatDate(post.publishedAt, locale)}</time>
      <h3 className="mt-3 text-base font-semibold text-foreground group-hover:text-accent">
        <Link href={`/blog/${post.id}`} className="hover:underline underline-offset-4">
          {post.title}
        </Link>
      </h3>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted line-clamp-4">{post.excerpt}</p>
      <Link
        href={`/blog/${post.id}`}
        className="mt-4 text-sm text-accent hover:underline underline-offset-4"
      >
        {t('readMore')}
      </Link>
    </article>
  );
}

export function BlogPreview({ posts, locale }: { posts: BlogPost[]; locale: string }) {
  const t = useTranslations('sections');

  if (posts.length === 0) {
    return null;
  }

  return (
    <section id="blog" className="px-4 py-12 sm:px-6 sm:py-16 md:px-12">
      <div className="mb-6 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg text-foreground">{t('blog')}</h2>
        <Link
          href="/blog"
          className="text-sm text-accent transition-opacity hover:underline underline-offset-4"
        >
          {t('viewAllArticles')}
        </Link>
      </div>
      <div className="grid auto-rows-fr gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.slice(0, 3).map((post) => (
          <BlogCard key={post.id} post={post} locale={locale} />
        ))}
      </div>
    </section>
  );
}

export function BlogList({ posts, locale }: { posts: BlogPost[]; locale: string }) {
  return (
    <div className="grid auto-rows-fr gap-6 sm:gap-8 lg:grid-cols-2">
      {posts.map((post) => (
        <BlogCard key={post.id} post={post} locale={locale} />
      ))}
    </div>
  );
}
