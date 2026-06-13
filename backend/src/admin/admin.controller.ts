import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ContentService } from '../content/content.service';
import type { ExperienceItem, Profile, Project } from '../types';
import { AdminAuthGuard } from './admin-auth.guard';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly content: ContentService,
  ) {}

  @Post('login')
  login(@Body('accessKey') accessKey: string) {
    const expected = process.env.ADMIN_ACCESS_KEY;
    if (!expected || accessKey !== expected) {
      throw new UnauthorizedException('Invalid access key');
    }

    const token = this.jwt.sign({ role: 'admin' }, { expiresIn: '7d' });
    return { token };
  }

  @Get('verify')
  @UseGuards(AdminAuthGuard)
  verify() {
    return { ok: true };
  }
}

@Controller('admin/content')
@UseGuards(AdminAuthGuard)
export class AdminContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  getAll() {
    return this.content.getAllContent();
  }

  @Put('profile')
  updateProfile(@Body() profile: Profile) {
    return this.content.updateProfile(profile);
  }

  @Put('projects')
  updateProjects(@Body() projects: Project[]) {
    return this.content.updateProjects(projects);
  }

  @Put('experience')
  updateExperience(@Body() experience: ExperienceItem[]) {
    return this.content.updateExperience(experience);
  }
}
