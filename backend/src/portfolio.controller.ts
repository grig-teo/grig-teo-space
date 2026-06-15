import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import type { Locale } from './types';

@Controller()
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('profile')
  async profile(@Query('locale') locale?: string) {
    const loc = this.portfolio.resolveLocale(locale);
    const data = await this.portfolio.getProfile();
    const phone = data.contact.phone ? this.portfolio.pick(data.contact.phone, loc) : '';
    return {
      name: this.portfolio.pick(data.name, loc),
      title: this.portfolio.pick(data.title, loc),
      location: this.portfolio.pick(data.location, loc),
      contact: {
        email: data.contact.email,
        github: data.contact.github,
        linkedin: data.contact.linkedin,
        ...(phone ? { phone } : {}),
      },
    };
  }

  @Get('projects')
  async projects(@Query('locale') locale?: string) {
    const loc = this.portfolio.resolveLocale(locale);
    const items = await this.portfolio.getProjects();
    return items.map((project) => ({
      id: project.id,
      title: this.portfolio.pick(project.title, loc),
      description: this.portfolio.pick(project.description, loc),
      overview: this.portfolio.pick(project.overview, loc),
      highlights: project.highlights[loc] ?? project.highlights.en,
      url: project.url,
      tags: project.tags,
      inDevelopment: project.inDevelopment ?? false,
    }));
  }

  @Get('experience')
  async experience(@Query('locale') locale?: string) {
    const loc = this.portfolio.resolveLocale(locale);
    const items = await this.portfolio.getExperience();
    return items.map((item) => ({
      id: item.id,
      period: this.portfolio.pick(item.period, loc),
      role: this.portfolio.pick(item.role, loc),
      company: item.company,
      companyUrl: item.companyUrl,
      description: this.portfolio.pick(item.description, loc),
    }));
  }

  @Get('experience/ids')
  async experienceIds() {
    return this.portfolio.getExperienceIds();
  }

  @Get('blog')
  async blog(@Query('locale') locale?: string) {
    const loc = this.portfolio.resolveLocale(locale);
    const posts = await this.portfolio.getBlogPosts();
    return posts.map((post) => ({
      id: post.id,
      title: this.portfolio.pick(post.title, loc),
      excerpt: this.portfolio.pick(post.excerpt, loc),
      publishedAt: post.publishedAt,
    }));
  }

  @Get('blog/ids')
  async blogIds() {
    return this.portfolio.getBlogIds();
  }

  @Get('blog/:id')
  async blogDetail(@Param('id') id: string, @Query('locale') locale?: string) {
    const post = await this.portfolio.getBlogPostById(id);
    if (!post) {
      throw new NotFoundException('Blog post not found');
    }
    const loc = this.portfolio.resolveLocale(locale);
    return {
      id: post.id,
      title: this.portfolio.pick(post.title, loc),
      excerpt: this.portfolio.pick(post.excerpt, loc),
      body: this.portfolio.pick(post.body, loc),
      publishedAt: post.publishedAt,
    };
  }

  @Get('experience/:id')
  async experienceDetail(@Param('id') id: string, @Query('locale') locale?: string) {
    const item = await this.portfolio.getExperienceById(id);
    if (!item) {
      throw new NotFoundException('Experience item not found');
    }
    const loc = this.portfolio.resolveLocale(locale);
    return {
      id: item.id,
      period: this.portfolio.pick(item.period, loc),
      role: this.portfolio.pick(item.role, loc),
      company: item.company,
      companyUrl: item.companyUrl,
      description: this.portfolio.pick(item.description, loc),
      summary: item.summary ? this.portfolio.pick(item.summary, loc) : undefined,
      highlights: item.highlights[loc] ?? item.highlights.en,
      stack: item.stack ? this.portfolio.pick(item.stack, loc) : undefined,
    };
  }

  @Get('cv')
  @Header('Content-Type', 'application/pdf')
  async downloadCv(@Query('locale') locale?: string) {
    const loc = this.portfolio.resolveLocale(locale);
    const stream = await this.portfolio.getCvStream(loc);
    if (!stream) {
      throw new NotFoundException('CV file not found');
    }
    return new StreamableFile(stream, {
      type: 'application/pdf',
      disposition: `attachment; filename="grigore_teodoru_cv_${loc}.pdf"`,
    });
  }
}
