import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { createReadStream, existsSync } from 'fs';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { promisify } from 'util';
import type { ExperienceItem, Profile, Project } from '../types';

const execFileAsync = promisify(execFile);

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);
  readonly cvPath = join(process.cwd(), 'generated', 'grigore_teodoru_cv.pdf');
  private readonly scriptPath = join(process.cwd(), 'scripts', 'generate_cv.py');

  async rebuild(
    profile: Profile,
    experience: ExperienceItem[],
    projects: Project[],
  ): Promise<void> {
    const inputPath = join(tmpdir(), `cv-input-${Date.now()}.json`);

    const payload = {
      name: profile.name.en || profile.name.ro,
      title: profile.title.en,
      contact: {
        email: profile.contact.email,
        website: 'https://grig-teo.space',
        github: profile.contact.github,
        linkedin: profile.contact.linkedin,
      },
      projects: projects.map((project) => ({
        title: project.title.en,
        description: project.description.en,
        overview: project.overview.en,
        highlights: project.highlights.en ?? [],
        tags: project.tags.join(', '),
        inDevelopment: project.inDevelopment ?? false,
      })),
      experience: experience.map((item) => ({
        company: item.company,
        role: item.role.en,
        period: item.period.en,
        summary: item.summary?.en ?? item.description.en,
        bullets: item.highlights.en ?? [],
        stack: item.stack?.en ?? '',
      })),
    };

    try {
      await mkdir(dirname(this.cvPath), { recursive: true });
      await writeFile(inputPath, JSON.stringify(payload), 'utf8');
      await execFileAsync('python3', [
        this.scriptPath,
        '--input',
        inputPath,
        '--output',
        this.cvPath,
      ]);
      this.logger.log(`CV regenerated at ${this.cvPath}`);
    } catch (error) {
      this.logger.error('Failed to regenerate CV', error instanceof Error ? error.stack : error);
      throw error;
    } finally {
      await unlink(inputPath).catch(() => undefined);
    }
  }

  exists(): boolean {
    return existsSync(this.cvPath);
  }

  getStream() {
    return createReadStream(this.cvPath);
  }
}
