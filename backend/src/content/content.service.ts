import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  getDefaultExperience,
  getDefaultProfile,
  getDefaultProjects,
} from '../data/default-content';
import { ContentKey, SiteContent } from '../entities/site-content.entity';
import type { ExperienceItem, Profile, Project } from '../types';

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(SiteContent)
    private readonly repo: Repository<SiteContent>,
  ) {}

  async seedIfEmpty(): Promise<void> {
    const count = await this.repo.count();
    if (count > 0) {
      return;
    }

    await this.repo.save([
      { key: 'profile', data: getDefaultProfile() },
      { key: 'projects', data: getDefaultProjects() },
      { key: 'experience', data: getDefaultExperience() },
    ]);
  }

  async getProfile(): Promise<Profile> {
    return this.getJson<Profile>('profile', getDefaultProfile());
  }

  async getProjects(): Promise<Project[]> {
    return this.getJson<Project[]>('projects', getDefaultProjects());
  }

  async getExperience(): Promise<ExperienceItem[]> {
    return this.getJson<ExperienceItem[]>('experience', getDefaultExperience());
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

  async updateProfile(profile: Profile): Promise<Profile> {
    await this.saveJson('profile', profile);
    return profile;
  }

  async updateProjects(projects: Project[]): Promise<Project[]> {
    await this.saveJson('projects', projects);
    return projects;
  }

  async updateExperience(experience: ExperienceItem[]): Promise<ExperienceItem[]> {
    await this.saveJson('experience', experience);
    return experience;
  }

  private async getJson<T>(key: ContentKey, fallback: T): Promise<T> {
    const row = await this.repo.findOne({ where: { key } });
    return (row?.data as T | undefined) ?? fallback;
  }

  private async saveJson(key: ContentKey, data: unknown): Promise<void> {
    await this.repo.save({ key, data });
  }
}
