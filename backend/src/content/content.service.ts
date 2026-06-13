import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CvService } from '../cv/cv.service';
import { ContentKey, SiteContent } from '../entities/site-content.entity';
import type { ExperienceItem, Profile, Project } from '../types';

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(SiteContent)
    private readonly repo: Repository<SiteContent>,
    private readonly cv: CvService,
  ) {}

  async getProfile(): Promise<Profile> {
    return this.getJson<Profile>('profile');
  }

  async getProjects(): Promise<Project[]> {
    const projects = await this.getJson<Project[]>('projects');
    return this.sortProjects(projects);
  }

  async getExperience(): Promise<ExperienceItem[]> {
    return this.getJson<ExperienceItem[]>('experience');
  }

  async getExperienceById(id: string): Promise<ExperienceItem | undefined> {
    const items = await this.getExperience();
    return items.find((item) => item.id === id);
  }

  async getExperienceIds(): Promise<string[]> {
    const items = await this.getExperience();
    return items.map((item) => item.id);
  }

  async getAllContent(): Promise<{
    profile: Profile;
    projects: Project[];
    experience: ExperienceItem[];
  }> {
    const [profile, projects, experience] = await Promise.all([
      this.getProfile(),
      this.getProjects(),
      this.getExperience(),
    ]);
    return { profile, projects, experience };
  }

  async rebuildCv(): Promise<void> {
    const [profile, projects, experience] = await Promise.all([
      this.getProfile(),
      this.getProjects(),
      this.getExperience(),
    ]);
    await this.cv.rebuild(profile, experience, projects);
  }

  async updateProfile(profile: Profile): Promise<Profile> {
    await this.saveJson('profile', profile);
    await this.rebuildCv();
    return profile;
  }

  async updateProjects(projects: Project[]): Promise<Project[]> {
    const normalized = this.sortProjects(
      projects.map((project, index, arr) => ({
        ...project,
        sortOrder: arr.length - index,
      })),
    );
    await this.saveJson('projects', normalized);
    await this.rebuildCv();
    return normalized;
  }

  async updateExperience(experience: ExperienceItem[]): Promise<ExperienceItem[]> {
    await this.saveJson('experience', experience);
    await this.rebuildCv();
    return experience;
  }

  private async getJson<T>(key: ContentKey): Promise<T> {
    const row = await this.repo.findOne({ where: { key } });
    if (!row?.data) {
      throw new NotFoundException(`Content "${key}" not found in database`);
    }
    return row.data as T;
  }

  private async saveJson(key: ContentKey, data: unknown): Promise<void> {
    await this.repo.save({ key, data });
  }

  private sortProjects(projects: Project[]): Project[] {
    const fallbackOrder: Record<string, number> = {
      vecin2vecin: 2,
      'debate-room': 1,
    };

    return [...projects]
      .map((project, index) => ({
        ...project,
        sortOrder: project.sortOrder ?? fallbackOrder[project.id] ?? index,
      }))
      .sort((a, b) => b.sortOrder - a.sortOrder);
  }
}
