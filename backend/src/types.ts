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
