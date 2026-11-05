/**
 * The site's locales. Single source of truth: the CV generator, the humanizer,
 * the graph and the locale resolvers all derive from this list.
 */
export const LOCALES = ['en', 'ru', 'ro', 'es'] as const;

export type Locale = (typeof LOCALES)[number];

export type LocalizedString = Record<Locale, string>;
export type LocalizedList = Record<Locale, string[]>;

export type ExperienceAttachmentType = 'video' | 'image' | 'doc';

export interface ExperienceAttachment {
  /** Inferred from the URL extension when omitted. */
  type?: ExperienceAttachmentType;
  url: string;
  title?: string;
}

/**
 * Three-state maturity for the case studies. `inDevelopment` is kept for older
 * content; when `status` is absent the API derives it from that boolean.
 */
export type ProjectStatus = 'production' | 'prototype' | 'in-development';

export interface Project {
  id: string;
  title: LocalizedString;
  description: LocalizedString;
  overview: LocalizedString;
  highlights: LocalizedList;
  url: LocalizedString;
  tags: string[];
  /** Explicit maturity. Absent falls back to `inDevelopment`. */
  status?: ProjectStatus;
  inDevelopment?: boolean;
  image?: string;
  /** Files attached to this project (demo videos, screenshots, docs…). */
  attachments?: ExperienceAttachment[];
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
  /** Files attached to this entry (demo videos, screenshots, PDFs…). */
  attachments?: ExperienceAttachment[];
}

export interface ContactInfo {
  email: LocalizedString;
  github: string;
  /** GitVerse is the Russian git host; shown next to GitHub in the footer. */
  gitverse?: string;
  linkedin: string;
  phone?: LocalizedString;
  /** Messenger handles, typed into the admin form as a handle or a full URL.
   *  Telegram serves the non-Russian locales, MAX the Russian one. */
  telegram?: string;
  max?: string;
  whatsapp?: string;
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

/** Every locale keyed to an empty string, or to `value` where it is present. */
export function localizedFrom(value?: Partial<Record<Locale, string>>): LocalizedString {
  return Object.fromEntries(LOCALES.map((code) => [code, value?.[code] ?? ''])) as LocalizedString;
}

/** The same string in every locale, for values saved before i18n existed. */
export function localizedAll(value: string): LocalizedString {
  return localizedFrom(Object.fromEntries(LOCALES.map((code) => [code, value])));
}
