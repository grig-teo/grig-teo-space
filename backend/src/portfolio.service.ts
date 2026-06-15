import { Injectable } from '@nestjs/common';
import { ContentService } from './content/content.service';
import { CvService } from './cv/cv.service';
import type { BlogPost, ExperienceItem, Locale, Profile, Project } from './types';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly content: ContentService,
    private readonly cv: CvService,
  ) {}

  async getProfile(): Promise<Profile> {
    return this.content.getProfile();
  }

  async getProjects(): Promise<Project[]> {
    return this.content.getProjects();
  }

  async getExperience(): Promise<ExperienceItem[]> {
    return this.content.getExperience();
  }

  async getExperienceById(id: string): Promise<ExperienceItem | undefined> {
    return this.content.getExperienceById(id);
  }

  async getExperienceIds(): Promise<string[]> {
    return this.content.getExperienceIds();
  }

  async getBlogPosts(): Promise<BlogPost[]> {
    return this.content.getBlogPosts();
  }

  async getBlogPostById(id: string): Promise<BlogPost | undefined> {
    return this.content.getBlogPostById(id);
  }

  async getBlogIds(): Promise<string[]> {
    return this.content.getBlogIds();
  }

  async getCvStream(locale: Locale) {
    if (!this.cv.exists(locale)) {
      await this.content.rebuildCv();
    }
    if (!this.cv.exists(locale)) {
      return null;
    }
    return this.cv.getStream(locale);
  }

  resolveLocale(locale?: string): Locale {
    if (locale === 'ru' || locale === 'ro' || locale === 'en') {
      return locale;
    }
    return 'en';
  }

  pick<T extends Record<Locale, string>>(value: T, locale: Locale): string {
    return value[locale] ?? value.en;
  }
}
