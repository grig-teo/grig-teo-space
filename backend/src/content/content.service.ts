import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CvService } from '../cv/cv.service';
import { ContentKey, SiteContent } from '../entities/site-content.entity';
import type { BlogPost, ExperienceItem, LocalizedString, Profile, Project } from '../types';

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(SiteContent)
    private readonly repo: Repository<SiteContent>,
    private readonly cv: CvService,
  ) {}

  async getProfile(): Promise<Profile> {
    const profile = await this.getJson<Profile>('profile');
    return this.normalizeProfile(profile);
  }

  async getProjects(): Promise<Project[]> {
    const projects = await this.getJson<Project[]>('projects');
    return this.sortProjects(projects.map((project) => this.normalizeProject(project)));
  }

  async getProjectById(id: string): Promise<Project | undefined> {
    const projects = await this.getProjects();
    return projects.find((project) => project.id === id);
  }

  async getProjectIds(): Promise<string[]> {
    const projects = await this.getProjects();
    return projects.map((project) => project.id);
  }

  async getExperience(): Promise<ExperienceItem[]> {
    const items = await this.getJson<ExperienceItem[]>('experience');
    return items.map((item) => this.normalizeExperienceItem(item));
  }

  async getExperienceById(id: string): Promise<ExperienceItem | undefined> {
    const items = await this.getExperience();
    return items.find((item) => item.id === id);
  }

  async getExperienceIds(): Promise<string[]> {
    const items = await this.getExperience();
    return items.map((item) => item.id);
  }

  async getBlogPosts(): Promise<BlogPost[]> {
    const row = await this.repo.findOne({ where: { key: 'blog' } });
    if (!row?.data) {
      return [];
    }
    return this.sortBlogPosts(row.data as BlogPost[]);
  }

  async getBlogPostById(id: string): Promise<BlogPost | undefined> {
    const posts = await this.getBlogPosts();
    return posts.find((post) => post.id === id);
  }

  async getBlogIds(): Promise<string[]> {
    const posts = await this.getBlogPosts();
    return posts.map((post) => post.id);
  }

  async getAllContent(): Promise<{
    profile: Profile;
    projects: Project[];
    experience: ExperienceItem[];
    blog: BlogPost[];
  }> {
    const [profile, projects, experience, blog] = await Promise.all([
      this.getProfile(),
      this.getProjects(),
      this.getExperience(),
      this.getBlogPosts(),
    ]);
    return { profile, projects, experience, blog };
  }

  async rebuildCv(): Promise<void> {
    const [profile, projects, experience] = await Promise.all([
      this.getProfile(),
      this.getProjects(),
      this.getExperience(),
    ]);
    await this.cv.rebuildAll(profile, experience, projects);
  }

  async updateProfile(profile: Profile): Promise<Profile> {
    const normalized = this.normalizeProfile(profile);
    await this.saveJson('profile', normalized);
    await this.rebuildCv();
    return normalized;
  }

  async updateProjects(projects: Project[]): Promise<Project[]> {
    const normalized = this.sortProjects(
      projects.map((project, index, arr) => ({
        ...this.normalizeProject(project),
        sortOrder: arr.length - index,
      })),
    );
    await this.saveJson('projects', normalized);
    await this.rebuildCv();
    return normalized;
  }

  async updateExperience(experience: ExperienceItem[]): Promise<ExperienceItem[]> {
    const normalized = experience.map((item) => this.normalizeExperienceItem(item));
    await this.saveJson('experience', normalized);
    await this.rebuildCv();
    return normalized;
  }

  async updateBlogPosts(posts: BlogPost[]): Promise<BlogPost[]> {
    const normalized = this.sortBlogPosts(
      posts.map((post, index, arr) => ({
        ...post,
        sortOrder: post.sortOrder ?? arr.length - index,
      })),
    );
    await this.saveJson('blog', normalized);
    return normalized;
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

  private normalizeProject(project: Project): Project {
    const url = project.url as LocalizedString | string;
    const normalizedUrl: LocalizedString =
      typeof url === 'string'
        ? { en: url, ru: url, ro: url }
        : {
            en: url.en ?? '',
            ru: url.ru ?? '',
            ro: url.ro ?? '',
          };
    return { ...project, url: normalizedUrl };
  }

  private normalizeProfile(profile: Profile): Profile {
    const email = profile.contact.email as LocalizedString | string;
    const about = (profile as Profile & { about?: LocalizedString | string }).about;
    const normalizedEmail: LocalizedString =
      typeof email === 'string'
        ? { en: email, ru: email, ro: email }
        : {
            en: email.en ?? '',
            ru: email.ru ?? '',
            ro: email.ro ?? '',
          };
    const normalizedAbout: LocalizedString =
      typeof about === 'string'
        ? { en: about, ru: about, ro: about }
        : {
            en: about?.en ?? '',
            ru: about?.ru ?? '',
            ro: about?.ro ?? '',
          };

    return {
      ...profile,
      about: normalizedAbout,
      contact: {
        ...profile.contact,
        email: normalizedEmail,
      },
    };
  }

  private normalizeExperienceItem(item: ExperienceItem): ExperienceItem {
    const company = item.company as LocalizedString | string;
    const normalizedCompany: LocalizedString =
      typeof company === 'string'
        ? { en: company, ru: company, ro: company }
        : {
            en: company.en ?? '',
            ru: company.ru ?? '',
            ro: company.ro ?? '',
          };

    const companyUrl = item.companyUrl as LocalizedString | string | undefined;
    let normalizedCompanyUrl: LocalizedString | undefined;
    if (companyUrl === undefined || companyUrl === null || companyUrl === '') {
      normalizedCompanyUrl = undefined;
    } else if (typeof companyUrl === 'string') {
      normalizedCompanyUrl = companyUrl
        ? { en: companyUrl, ru: companyUrl, ro: companyUrl }
        : undefined;
    } else {
      const hasAny = Boolean(companyUrl.en || companyUrl.ru || companyUrl.ro);
      normalizedCompanyUrl = hasAny
        ? {
            en: companyUrl.en ?? '',
            ru: companyUrl.ru ?? '',
            ro: companyUrl.ro ?? '',
          }
        : undefined;
    }

    return { ...item, company: normalizedCompany, companyUrl: normalizedCompanyUrl };
  }

  private sortBlogPosts(posts: BlogPost[]): BlogPost[] {
    return [...posts]
      .map((post, index) => ({
        ...post,
        sortOrder: post.sortOrder ?? index,
      }))
      .sort((a, b) => {
        const dateA = Date.parse(a.publishedAt) || 0;
        const dateB = Date.parse(b.publishedAt) || 0;
        if (dateB !== dateA) {
          return dateB - dateA;
        }
        return (b.sortOrder ?? 0) - (a.sortOrder ?? 0);
      });
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
