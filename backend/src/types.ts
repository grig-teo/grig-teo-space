export type Locale = 'en' | 'ru' | 'ro';

export type LocalizedString = Record<Locale, string>;
export type LocalizedList = Record<Locale, string[]>;

export type ExperienceAttachmentType = 'video' | 'image' | 'doc';

export interface ExperienceAttachment {
  /** Inferred from the URL extension when omitted. */
  type?: ExperienceAttachmentType;
  url: string;
  title?: string;
}

export interface Project {
  id: string;
  title: LocalizedString;
  description: LocalizedString;
  overview: LocalizedString;
  highlights: LocalizedList;
  url: LocalizedString;
  tags: string[];
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
