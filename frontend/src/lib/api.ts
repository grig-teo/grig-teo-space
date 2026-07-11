export type Locale = 'en' | 'ru' | 'ro';

export interface Profile {
  name: string;
  title: string;
  location: string;
  about: string;
  contact: {
    email: string;
    github: string;
    linkedin: string;
    phone?: string;
  };
}

export interface Project {
  id: string;
  title: string;
  description: string;
  overview: string;
  highlights: string[];
  url: string;
  tags: string[];
  inDevelopment?: boolean;
}

export interface ExperienceItem {
  id: string;
  period: string;
  role: string;
  company: string;
  companyUrl?: string;
  description: string;
}

export interface ExperienceDetail extends ExperienceItem {
  summary?: string;
  highlights: string[];
  stack?: string;
}

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  publishedAt: string;
}

export interface BlogPostDetail extends BlogPost {
  body: string;
}

function publicApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  return configured ?? '';
}

function apiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return publicApiBaseUrl();
  }
  return process.env.API_INTERNAL_URL ?? 'http://backend:3001';
}

function buildApiUrl(path: string, locale: Locale): string {
  const base = apiBaseUrl();
  const prefix = base ? `${base}/api` : '/api';
  return `${prefix}${path}?locale=${locale}`;
}

async function fetchJson<T>(path: string, locale: Locale, dynamic = false): Promise<T> {
  const url = buildApiUrl(path, locale);
  const res = await fetch(
    url,
    dynamic ? { cache: 'no-store' } : { next: { revalidate: 60 } },
  );
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

export function getProfile(locale: Locale) {
  return fetchJson<Profile>('/profile', locale);
}

export function getProjects(locale: Locale) {
  return fetchJson<Project[]>('/projects', locale);
}

export function getExperience(locale: Locale) {
  return fetchJson<ExperienceItem[]>('/experience', locale);
}

export function getExperienceDetail(id: string, locale: Locale) {
  return fetchJson<ExperienceDetail>(`/experience/${id}`, locale, true);
}

export async function getExperienceIds(): Promise<string[]> {
  const base = apiBaseUrl();
  const prefix = base ? `${base}/api` : '/api';
  const res = await fetch(`${prefix}/experience/ids`, { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} /experience/ids`);
  }
  return res.json() as Promise<string[]>;
}

export function getBlogPosts(locale: Locale) {
  return fetchJson<BlogPost[]>('/blog', locale);
}

export function getBlogPost(id: string, locale: Locale) {
  return fetchJson<BlogPostDetail>(`/blog/${id}`, locale, true);
}

export async function getBlogIds(): Promise<string[]> {
  const base = apiBaseUrl();
  const prefix = base ? `${base}/api` : '/api';
  const res = await fetch(`${prefix}/blog/ids`, { next: { revalidate: 60 } });
  if (!res.ok) {
    return [];
  }
  return res.json() as Promise<string[]>;
}

export function getCvUrl(locale: Locale = 'en'): string {
  const base = publicApiBaseUrl();
  const prefix = base ? `${base}/api` : '/api';
  return `${prefix}/cv?locale=${locale}`;
}

// --- Public health page ---------------------------------------------------

export type PublicHealthMetric = {
  metric: string;
  label: string;
  unit: string | null;
  summary: {
    avg: number | null;
    min: number | null;
    max: number | null;
    latest: { recordedAt: string; value: number } | null;
  };
  series: { recordedAt: string; value: number }[];
};

export type PublicHealthPayload = {
  enabled: boolean;
  displayName: string;
  windowDays: number;
  metrics: PublicHealthMetric[];
};

/** Returns null when the public health page is disabled (404-safe). */
export async function getPublicHealth(): Promise<PublicHealthPayload | null> {
  const base = apiBaseUrl();
  const prefix = base ? `${base}/api` : '/api';
  try {
    const res = await fetch(`${prefix}/health/public`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PublicHealthPayload;
    return data.enabled ? data : null;
  } catch {
    return null;
  }
}
