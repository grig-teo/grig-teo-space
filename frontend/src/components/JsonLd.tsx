import type { BlogPost, BlogPostDetail, Profile } from '@/lib/api';

type Props = {
  profile: Profile;
  locale: string;
};

const alternateNames: Record<string, string[]> = {
  en: ['Grigore Teodoru', 'Gregory Theodor'],
  ru: ['Grigore Teodoru', 'Gregory Theodor', 'Григорий Федоров'],
  ro: ['Gregory Theodor', 'Grigore Teodoru'],
};

export function JsonLd({ profile, locale }: Props) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    alternateName: alternateNames[locale] ?? alternateNames.en,
    jobTitle: profile.title,
    url: `https://grig-teo.space/${locale}`,
    email: profile.contact.email,
    sameAs: [profile.contact.github, profile.contact.linkedin],
    knowsAbout: [
      'Full-stack development',
      'Remote software development',
      'Freelance software development',
      'TypeScript',
      'NestJS',
      'Next.js',
      'WebRTC',
      'Real-time applications',
      'iOS development',
      'Android development',
      'Mobile application development',
      'Marketplace development',
      'Payment integration',
      'Docker',
      'MongoDB',
    ],
    homeLocation: {
      '@type': 'Place',
      name: profile.location,
    },
    ...(profile.contact.phone ? { telephone: profile.contact.phone } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

type BlogPostingProps = {
  post: BlogPostDetail;
  profile: Profile;
  locale: string;
  id: string;
};

/** Article structured data for blog posts — enables rich results with
 *  author/date signals and ties the author to the homepage Person entity. */
export function BlogPostingJsonLd({ post, profile, locale, id }: BlogPostingProps) {
  const pageUrl = `https://grig-teo.space/${locale}/blog/${id}`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    inLanguage: locale,
    mainEntityOfPage: pageUrl,
    image: `${pageUrl}/opengraph-image`,
    author: {
      '@type': 'Person',
      name: profile.name,
      url: `https://grig-teo.space/${locale}`,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

type BlogProps = {
  posts: BlogPost[];
  locale: string;
};

/** Blog listing structured data with references to each article. */
export function BlogJsonLd({ posts, locale }: BlogProps) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'grig-teo blog',
    url: `https://grig-teo.space/${locale}/blog`,
    inLanguage: locale,
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: `https://grig-teo.space/${locale}/blog/${post.id}`,
      datePublished: post.publishedAt,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
