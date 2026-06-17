export type Locale = 'en' | 'ru' | 'ro';

export type LocalizedString = Record<Locale, string>;
export type LocalizedList = Record<Locale, string[]>;

export interface Project {
  id: string;
  title: LocalizedString;
  description: LocalizedString;
  overview: LocalizedString;
  highlights: LocalizedList;
  url: LocalizedString;
  tags: string[];
  inDevelopment?: boolean;
  sortOrder?: number;
}

export interface ExperienceItem {
  id: string;
  period: LocalizedString;
  role: LocalizedString;
  company: string;
  companyUrl?: string;
  description: LocalizedString;
  summary?: LocalizedString;
  highlights: LocalizedList;
  stack?: LocalizedString;
}

export interface ContactInfo {
  email: string;
  github: string;
  linkedin: string;
  phone?: LocalizedString;
}

export interface Profile {
  name: LocalizedString;
  title: LocalizedString;
  location: LocalizedString;
  contact: ContactInfo;
}

export interface BlogPost {
  id: string;
  title: LocalizedString;
  excerpt: LocalizedString;
  body: LocalizedString;
  publishedAt: string;
  sortOrder?: number;
}

export interface SiteContent {
  profile: Profile;
  projects: Project[];
  experience: ExperienceItem[];
  blog: BlogPost[];
}

const TOKEN_KEY = 'admin_token';

function apiBase(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL ?? '';
  }
  return process.env.API_INTERNAL_URL ?? 'http://backend:3001';
}

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function adminLogin(accessKey: string): Promise<string> {
  const res = await fetch(`${apiBase()}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessKey }),
  });
  if (!res.ok) {
    throw new Error('Invalid access key');
  }
  const data = (await res.json()) as { token: string };
  setAdminToken(data.token);
  return data.token;
}

export async function adminVerify(): Promise<boolean> {
  const token = getAdminToken();
  if (!token) return false;
  const res = await fetch(`${apiBase()}/api/admin/auth/verify`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export async function adminGetContent(): Promise<SiteContent> {
  const res = await fetch(`${apiBase()}/api/admin/content`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load content');
  return res.json();
}

export async function adminSaveProfile(profile: Profile): Promise<boolean> {
  const res = await fetch(`${apiBase()}/api/admin/content/profile`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error('Failed to save profile');
  const data = (await res.json()) as { cvRebuilt?: boolean };
  return data.cvRebuilt ?? false;
}

export async function adminSaveProjects(projects: Project[]): Promise<boolean> {
  const res = await fetch(`${apiBase()}/api/admin/content/projects`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(projects),
  });
  if (!res.ok) throw new Error('Failed to save projects');
  const data = (await res.json()) as { cvRebuilt?: boolean };
  return data.cvRebuilt ?? false;
}

export async function adminSaveExperience(experience: ExperienceItem[]): Promise<boolean> {
  const res = await fetch(`${apiBase()}/api/admin/content/experience`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(experience),
  });
  if (!res.ok) throw new Error('Failed to save experience');
  const data = (await res.json()) as { cvRebuilt?: boolean };
  return data.cvRebuilt ?? false;
}

export async function adminSaveBlog(blog: BlogPost[]): Promise<void> {
  const res = await fetch(`${apiBase()}/api/admin/content/blog`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(blog),
  });
  if (!res.ok) throw new Error('Failed to save blog');
}

export async function adminUploadMedia(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const token = getAdminToken();
  const res = await fetch(`${apiBase()}/api/admin/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    throw new Error('Failed to upload file');
  }

  const data = (await res.json()) as { url: string };
  return data.url;
}
