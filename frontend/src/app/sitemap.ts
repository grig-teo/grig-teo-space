import type { MetadataRoute } from 'next';
import { getBlogIds, getExperienceIds, getProjectIds } from '@/lib/api';
import { routing } from '@/i18n/routing';

const baseUrl = 'https://grig-teo.space';

/**
 * Rendered per request, not baked into the image at build time.
 *
 * The ID lists come from the backend, which is not reachable while the Docker
 * image is built, so a build-time sitemap silently lost every case study and
 * blog URL. `revalidate` is ignored for this route, hence force-dynamic.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let experienceIds: string[] = [];
  let projectIds: string[] = [];
  let blogIds: string[] = [];
  try {
    experienceIds = await getExperienceIds();
  } catch {
    experienceIds = [];
  }
  try {
    projectIds = await getProjectIds();
  } catch {
    projectIds = [];
  }
  try {
    blogIds = await getBlogIds();
  } catch {
    blogIds = [];
  }

  // Priority reflects what earns a client inquiry, not how many pages exist:
  // the offer pages rank above the CV-style ones, case studies sit in between.
  const PRIORITY: Record<string, number> = {
    '': 1,
    '/services': 0.9,
    '/contact': 0.9,
    '/projects': 0.8,
    '/about': 0.7,
    '/blog': 0.6,
  };

  const priorityFor = (path: string): number =>
    PRIORITY[path] ?? (path.startsWith('/projects/') ? 0.7 : 0.5);

  const paths = [
    '',
    '/services',
    '/contact',
    '/projects',
    '/about',
    '/blog',
    ...projectIds.map((id) => `/projects/${id}`),
    ...blogIds.map((id) => `/blog/${id}`),
    ...experienceIds.map((id) => `/experience/${id}`),
  ];

  return routing.locales.flatMap((locale) =>
    paths.map((path) => ({
      url: `${baseUrl}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: priorityFor(path),
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((alt) => [alt, `${baseUrl}/${alt}${path}`]),
        ),
      },
    })),
  );
}
