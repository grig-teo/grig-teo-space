import { Injectable } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { ContentService } from './content/content.service';
import type { ExperienceItem, Locale, Profile, Project } from './types';

@Injectable()
export class PortfolioService {
  private readonly cvPath = join(process.cwd(), 'assets', 'grigore_teodoru_cv.pdf');

  constructor(private readonly content: ContentService) {}

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

  getCvStream() {
    if (!existsSync(this.cvPath)) {
      return null;
    }
    return createReadStream(this.cvPath);
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
