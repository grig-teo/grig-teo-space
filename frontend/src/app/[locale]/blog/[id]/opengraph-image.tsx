import { ImageResponse } from 'next/og';
import { getBlogPost } from '@/lib/api';
import type { Locale } from '@/lib/api';

export const alt = 'Blog article — grig-teo.space';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: Locale; id: string }>;
};

/** Per-article social card: post title + publish date on the site motif. */
export default async function OpengraphImage({ params }: Props) {
  const { locale, id } = await params;

  let title = 'grig-teo blog';
  let date = '';
  try {
    const post = await getBlogPost(id, locale);
    title = post.title;
    date = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(post.publishedAt));
  } catch {
    // Unknown/unavailable post — fall back to the generic card text.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          backgroundColor: '#0a0d12',
          color: '#e2e8f0',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ fontSize: 28, color: '#2dd4bf', marginBottom: 24 }}>
          grig-teo.space / blog
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.2 }}>
          {title}
        </div>
        {date ? (
          <div style={{ fontSize: 30, color: '#7d8a9b', marginTop: 24 }}>
            {date}
          </div>
        ) : null}
      </div>
    ),
    size,
  );
}
