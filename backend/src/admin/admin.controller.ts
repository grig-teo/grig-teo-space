import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Ip,
  Logger,
  Post,
  Put,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ContentService } from '../content/content.service';
import { LoginAttemptTracker } from '../security/login-attempt-tracker';
import { secureCompare } from '../security/secure-compare';
import type { BlogPost, ExperienceItem, Profile, Project } from '../types';
import { AdminAuthGuard } from './admin-auth.guard';

/** Name of the HttpOnly cookie carrying the admin JWT. */
export const ADMIN_COOKIE = 'admin_token';

/** JWT lifetime — keep cookie maxAge in sync with `expiresIn`. */
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('admin/auth')
export class AdminAuthController {
  private readonly logger = new Logger(AdminAuthController.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly content: ContentService,
    private readonly attempts: LoginAttemptTracker,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(
    @Body('accessKey') accessKey: string,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Defense-in-depth lockout: if this IP has accumulated too many
    // consecutive failures it is temporarily banned (15 min), even after
    // the per-minute throttle window resets.
    const banRemaining = this.attempts.getBanRemainingMs(ip);
    if (banRemaining > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many failed login attempts. Try again later.',
          retryAfterSec: Math.ceil(banRemaining / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const expected = process.env.ADMIN_ACCESS_KEY;
    // Fail closed when the key is unset; use constant-time comparison
    // (SHA-256 + timingSafeEqual) to close the timing side channel.
    if (!expected || !secureCompare(accessKey ?? '', expected)) {
      this.attempts.recordFailure(ip);
      this.logger.warn(`Failed admin login attempt from IP ${ip}`);
      throw new UnauthorizedException('Invalid access key');
    }

    this.attempts.recordSuccess(ip);
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
