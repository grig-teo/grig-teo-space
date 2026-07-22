import type { MetadataRoute } from 'next';
import { getBlogIds, getExperienceIds, getProjectIds } from '@/lib/api';
import { routing } from '@/i18n/routing';

const baseUrl = 'https://grig-teo.space';

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

  const paths = [
    '',
    '/blog',
    '/projects',
    ...blogIds.map((id) => `/blog/${id}`),
    ...projectIds.map((id) => `/projects/${id}`),
    ...experienceIds.map((id) => `/experience/${id}`),
  ];

  return routing.locales.flatMap((locale) =>
    paths.map((path) => ({
      url: `${baseUrl}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: path === '' ? 1 : path.startsWith('/experience/') || path.startsWith('/projects/') ? 0.7 : 0.8,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((alt) => [alt, `${baseUrl}/${alt}${path}`]),
        ),
      },
    })),
  );
}
