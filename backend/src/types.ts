export type Locale = 'en' | 'ru' | 'ro';

export type LocalizedString = Record<Locale, string>;
export type LocalizedList = Record<Locale, string[]>;

export interface Project {
  id: string;
  title: LocalizedString;
  description: LocalizedString;
  overview: LocalizedString;
  highlights: LocalizedList;
  url: string;
  tags: string[];
  inDevelopment?: boolean;
}

export interface ExperienceItem {
  id: string;
  period: LocalizedString;
  role: LocalizedString;
  company: string;
  companyUrl?: string;
  description: LocalizedString;
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
