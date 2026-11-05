import type { MetadataRoute } from 'next';

/**
 * Crawler rules. /admin is disallowed because it is a private dashboard: it is
 * already behind auth, and keeping it out of the index stops the login page
 * competing with the real site in search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/'],
    },
    sitemap: 'https://grig-teo.space/sitemap.xml',
    host: 'https://grig-teo.space',
  };
}
