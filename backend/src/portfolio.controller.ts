import {
  Controller,
  Get,
  Header,
  NotFoundException,
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
  profile(@Query('locale') locale?: string) {
    const loc = this.portfolio.resolveLocale(locale);
    const data = this.portfolio.getProfile();
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
  projects(@Query('locale') locale?: string) {
    const loc = this.portfolio.resolveLocale(locale);
    return this.portfolio.getProjects().map((project) => ({
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
  experience(@Query('locale') locale?: string) {
    const loc = this.portfolio.resolveLocale(locale);
    return this.portfolio.getExperience().map((item) => ({
      id: item.id,
      period: this.portfolio.pick(item.period, loc),
      role: this.portfolio.pick(item.role, loc),
      company: item.company,
      companyUrl: item.companyUrl,
      description: this.portfolio.pick(item.description, loc),
    }));
  }

  @Get('cv')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="grigore_teodoru_cv.pdf"')
  downloadCv() {
    const stream = this.portfolio.getCvStream();
    if (!stream) {
      throw new NotFoundException('CV file not found');
    }
    return new StreamableFile(stream);
  }
}
