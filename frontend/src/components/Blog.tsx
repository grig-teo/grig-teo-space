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

function BlogCard({
  post,
  locale,
  featured = false,
}: {
  post: BlogPost;
  locale: string;
  featured?: boolean;
}) {
  const t = useTranslations('sections');

  return (
    <article
      className={`group flex h-full flex-col rounded-lg border border-border bg-surface p-6 glow-card ${
        featured ? 'md:col-span-2 lg:col-span-3' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        {featured && (
          <span className="rounded border border-accent-2/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-2">
            {t('featured')}
          </span>
        )}
        <time className="font-mono text-xs text-muted">
          {formatDate(post.publishedAt, locale)}
        </time>
      </div>
      <h3
        className={`mt-3 font-mono font-semibold text-foreground group-hover:text-accent ${
          featured ? 'text-xl' : 'text-base'
        }`}
      >
        <Link href={`/blog/${post.id}`} className="hover:underline underline-offset-4">
          {post.title}
        </Link>
      </h3>
      <p className="mt-3 flex-1 font-sans text-sm leading-relaxed text-muted line-clamp-4">
        {post.excerpt}
      </p>
      <Link
        href={`/blog/${post.id}`}
        className="mt-4 font-mono text-sm text-accent hover:underline underline-offset-4"
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

  const [featured, ...rest] = posts.slice(0, 4);

  return (
    <section id="blog" className="px-4 py-12 sm:px-6 sm:py-16 md:px-12">
      <div className="mb-6 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-mono text-sm text-muted">
          <span className="text-accent">##</span> {t('blog')}
        </h2>
        <Link
          href="/blog"
          className="font-mono text-sm text-accent transition-opacity hover:underline underline-offset-4"
        >
          {t('viewAllArticles')}
        </Link>
      </div>
      <div className="grid auto-rows-fr gap-6 md:grid-cols-2 lg:grid-cols-3">
        <BlogCard post={featured} locale={locale} featured />
        {rest.map((post) => (
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
