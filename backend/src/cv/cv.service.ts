import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { createReadStream, existsSync } from 'fs';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { promisify } from 'util';
import type { ExperienceItem, Locale, Profile, Project } from '../types';

const execFileAsync = promisify(execFile);

export const CV_LOCALES: Locale[] = ['en', 'ru', 'ro'];

const CV_LABELS: Record<
  Locale,
  {
    projects: string;
    experience: string;
    languages: string;
    techStack: string;
    inDevelopment: string;
    contact: { website: string; github: string; linkedin: string; email: string };
    languageEntries: string[];
  }
> = {
  en: {
    projects: 'PROJECTS',
    experience: 'EXPERIENCE',
    languages: 'LANGUAGES',
    techStack: 'Tech stack:',
    inDevelopment: '(in development)',
    contact: { website: 'Website', github: 'GitHub', linkedin: 'LinkedIn', email: 'Email' },
    languageEntries: [
      'Russian — Native or Bilingual',
      'Romanian — Native or Bilingual',
      'English — Professional Working',
    ],
  },
  ru: {
    projects: 'ПРОЕКТЫ',
    experience: 'ОПЫТ',
    languages: 'ЯЗЫКИ',
    techStack: 'Стек:',
    inDevelopment: '(в разработке)',
    contact: { website: 'Сайт', github: 'GitHub', linkedin: 'LinkedIn', email: 'Email' },
    languageEntries: [
      'Русский — родной или bilingual',
      'Румынский — родной или bilingual',
      'Английский — professional working',
    ],
  },
  ro: {
    projects: 'PROIECTE',
    experience: 'EXPERIENȚĂ',
    languages: 'LIMBI',
    techStack: 'Stack:',
    inDevelopment: '(în dezvoltare)',
    contact: { website: 'Website', github: 'GitHub', linkedin: 'LinkedIn', email: 'Email' },
    languageEntries: [
      'Rusă — nativ sau bilingual',
      'Română — nativ sau bilingual',
      'Engleză — professional working',
    ],
  },
};

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);
  private readonly generatedDir = join(process.cwd(), 'generated');
  private readonly scriptPath = join(process.cwd(), 'scripts', 'generate_cv.py');

  cvPath(locale: Locale): string {
    return join(this.generatedDir, `grigore_teodoru_cv.${locale}.pdf`);
  }

  private pick<T extends Record<Locale, string>>(value: T, locale: Locale): string {
    return value[locale] ?? value.en;
  }

  private pickList(value: Record<Locale, string[]>, locale: Locale): string[] {
    return value[locale] ?? value.en ?? [];
  }

  buildPayload(
    profile: Profile,
    experience: ExperienceItem[],
    projects: Project[],
    locale: Locale,
  ) {
    const labels = CV_LABELS[locale];
    return {
      name: this.pick(profile.name, locale),
      title: this.pick(profile.title, locale),
      labels: {
        projects: labels.projects,
        experience: labels.experience,
        languages: labels.languages,
        techStack: labels.techStack,
        inDevelopment: labels.inDevelopment,
      },
      contact: {
        email: profile.contact.email,
        website: 'https://grig-teo.space',
        github: profile.contact.github,
        linkedin: profile.contact.linkedin,
        labels: labels.contact,
      },
      languages: labels.languageEntries,
      projects: projects.map((project) => ({
        title: this.pick(project.title, locale),
        description: this.pick(project.description, locale),
        overview: this.pick(project.overview, locale),
        highlights: this.pickList(project.highlights, locale),
        tags: project.tags.join(', '),
        inDevelopment: project.inDevelopment ?? false,
      })),
      experience: experience.map((item) => ({
        company: item.company,
        role: this.pick(item.role, locale),
        period: this.pick(item.period, locale),
        summary: item.summary
          ? this.pick(item.summary, locale)
          : this.pick(item.description, locale),
        bullets: this.pickList(item.highlights, locale),
        stack: item.stack ? this.pick(item.stack, locale) : '',
      })),
    };
  }

  async rebuildLocale(
    profile: Profile,
    experience: ExperienceItem[],
    projects: Project[],
    locale: Locale,
  ): Promise<void> {
    const outputPath = this.cvPath(locale);
    const inputPath = join(tmpdir(), `cv-input-${locale}-${Date.now()}.json`);
    const payload = this.buildPayload(profile, experience, projects, locale);

    try {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(inputPath, JSON.stringify(payload), 'utf8');
      await execFileAsync('python3', [
        this.scriptPath,
        '--input',
        inputPath,
        '--output',
        outputPath,
      ]);
      this.logger.log(`CV regenerated for ${locale} at ${outputPath}`);
    } catch (error) {
      this.logger.error(
        `Failed to regenerate CV for ${locale}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    } finally {
      await unlink(inputPath).catch(() => undefined);
    }
  }

  async rebuildAll(
    profile: Profile,
    experience: ExperienceItem[],
    projects: Project[],
  ): Promise<void> {
    await Promise.all(
      CV_LOCALES.map((locale) => this.rebuildLocale(profile, experience, projects, locale)),
    );
  }

  exists(locale: Locale): boolean {
    return existsSync(this.cvPath(locale));
  }

  getStream(locale: Locale) {
    return createReadStream(this.cvPath(locale));
  }
}
