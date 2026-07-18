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
  company: LocalizedString;
  companyUrl?: LocalizedString;
  description: LocalizedString;
  summary?: LocalizedString;
  highlights: LocalizedList;
  stack?: LocalizedString;
  attachments?: ExperienceAttachment[];
}

export type ExperienceAttachmentType = 'video' | 'image' | 'doc';

export interface ExperienceAttachment {
  type?: ExperienceAttachmentType;
  url: string;
  title?: string;
}

export interface ContactInfo {
  email: LocalizedString;
  github: string;
  linkedin: string;
  phone?: LocalizedString;
}

export interface Profile {
  name: LocalizedString;
  title: LocalizedString;
  location: LocalizedString;
  about: LocalizedString;
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

/**
 * The admin JWT lives in an HttpOnly cookie set by the backend on login, so
 * it is never readable from JS. All admin requests send it automatically via
 * `credentials: 'include'`.
 */
const CREDENTIALS: RequestCredentials = 'include';

/** localStorage key used by the pre-cookie auth scheme; cleaned up on load. */
export const LEGACY_TOKEN_KEY = 'admin_token';

function apiBase(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL ?? '';
  }
  return process.env.API_INTERNAL_URL ?? 'http://backend:3001';
}

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' };
}

/** Drops a token stored by the old localStorage-based auth scheme. */
export function clearLegacyToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export async function adminLogin(accessKey: string): Promise<string> {
  const res = await fetch(`${apiBase()}/api/admin/auth/login`, {
    method: 'POST',
    credentials: CREDENTIALS,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessKey }),
  });
  if (!res.ok) {
    throw new Error('Invalid access key');
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

export async function adminLogout(): Promise<void> {
  await fetch(`${apiBase()}/api/admin/auth/logout`, {
    method: 'POST',
    credentials: CREDENTIALS,
  });
}

export async function adminVerify(): Promise<boolean> {
  const res = await fetch(`${apiBase()}/api/admin/auth/verify`, {
    credentials: CREDENTIALS,
  });
  return res.ok;
}

export async function adminGetContent(): Promise<SiteContent> {
  const res = await fetch(`${apiBase()}/api/admin/content`, {
    credentials: CREDENTIALS,
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load content');
  return res.json();
}

export async function adminSaveProfile(profile: Profile): Promise<boolean> {
  const res = await fetch(`${apiBase()}/api/admin/content/profile`, {
    method: 'PUT',
    credentials: CREDENTIALS,
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
    credentials: CREDENTIALS,
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
    credentials: CREDENTIALS,
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
    credentials: CREDENTIALS,
    headers: authHeaders(),
    body: JSON.stringify(blog),
  });
  if (!res.ok) throw new Error('Failed to save blog');
}

export async function adminUploadMedia(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${apiBase()}/api/admin/upload`, {
    method: 'POST',
    credentials: CREDENTIALS,
    body: formData,
  });

  if (!res.ok) {
    throw new Error('Failed to upload file');
  }

  const data = (await res.json()) as { url: string };
  return data.url;
}

// --- Health pipeline ------------------------------------------------------

export type HealthMetric =
  | 'heart_rate'
  | 'spo2'
  | 'steps'
  | 'calories'
  | 'distance_km'
  | 'stress'
  | 'hrv'
  | 'sleep_duration_h'
  | 'sleep_quality';

export type MetricSeriesPoint = {
  recordedAt: string;
  value: number;
};

export type MetricSummary = {
  metric: HealthMetric;
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  latest: MetricSeriesPoint | null;
};

export type HealthAlert = {
  metric: HealthMetric;
  level: 'warning' | 'critical';
  message: string;
  value: number;
  recordedAt: string;
};

export type HealthOverview = {
  from: string;
  to: string;
  metrics: Array<MetricSummary & { series: MetricSeriesPoint[] }>;
  notes: Array<{
    id: string;
    content: string;
    mood: string | null;
    source: string;
    recordedAt: string;
  }>;
  alerts: HealthAlert[];
};

export type MetricPublicConfig = {
  show: boolean;
  label?: string;
};

export type HealthPublicConfig = {
  enabled: boolean;
  displayName: string;
  windowDays: number;
  metrics: Partial<Record<HealthMetric, MetricPublicConfig>>;
};

export async function adminGetHealthOverview(days = 7): Promise<HealthOverview> {
  const res = await fetch(`${apiBase()}/api/admin/health/overview?days=${days}`, {
    credentials: CREDENTIALS,
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load health overview');
  return res.json();
}

export async function adminGetHealthConfig(): Promise<HealthPublicConfig> {
  const res = await fetch(`${apiBase()}/api/admin/health/config`, {
    credentials: CREDENTIALS,
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load health config');
  return res.json();
}

export async function adminSaveHealthConfig(
  config: HealthPublicConfig,
): Promise<HealthPublicConfig> {
  const res = await fetch(`${apiBase()}/api/admin/health/config`, {
    method: 'PUT',
    credentials: CREDENTIALS,
    headers: authHeaders(),
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save health config');
  return res.json();
}
