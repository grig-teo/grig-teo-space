import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { ContentService } from '../content/content.service';
import type { BlogPost, ExperienceItem, Profile, Project } from '../types';
import { AdminAuthGuard } from './admin-auth.guard';

/** Name of the HttpOnly cookie carrying the admin JWT. */
export const ADMIN_COOKIE = 'admin_token';

/** JWT lifetime — keep cookie maxAge in sync with `expiresIn`. */
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly content: ContentService,
  ) {}

  @Post('login')
  login(
    @Body('accessKey') accessKey: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = process.env.ADMIN_ACCESS_KEY;
    if (!expected || accessKey !== expected) {
      throw new UnauthorizedException('Invalid access key');
    }

    const token = this.jwt.sign({ role: 'admin' }, { expiresIn: '7d' });
    // HttpOnly so JS can't read it (XSS-safe); Secure is still honored by
    // browsers on http://localhost, so local dev keeps working.
    res.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: TOKEN_TTL_MS,
    });
    return { token };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    return { ok: true };
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
  async updateProfile(@Body() profile: Profile) {
    await this.content.updateProfile(profile);
    return { profile, cvRebuilt: true };
  }

  @Put('projects')
  async updateProjects(@Body() projects: Project[]) {
    const result = await this.content.updateProjects(projects);
    return { projects: result, cvRebuilt: true };
  }

  @Put('experience')
  async updateExperience(@Body() experience: ExperienceItem[]) {
    await this.content.updateExperience(experience);
    return { experience, cvRebuilt: true };
  }

  @Put('blog')
  async updateBlog(@Body() blog: BlogPost[]) {
    const result = await this.content.updateBlogPosts(blog);
    return { blog: result };
  }
}
