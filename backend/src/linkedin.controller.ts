import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LinkedInService } from './linkedin.service';

@Controller('linkedin')
export class LinkedInController {
  constructor(private readonly linkedin: LinkedInService) {}

  @Get('connect')
  connect(@Res() res: Response) {
    const state = this.linkedin.createAuthState();
    const url = this.linkedin.buildAuthUrl(state.value);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      return res.status(400).send('Missing code/state from LinkedIn callback');
    }

    try {
      const profile = await this.linkedin.completeAuth(code, state);
      const siteUrl = process.env.SITE_URL?.trim();
      if (siteUrl) {
        return res.redirect(`${siteUrl}/en?linkedin=connected`);
      }
      return res.status(200).send(`LinkedIn connected. Welcome, ${profile.name ?? 'user'}!`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return res.status(500).send(`LinkedIn auth failed: ${message}`);
    }
  }

  @Get('profile')
  async profile() {
    const profile = await this.linkedin.getStoredProfile();
    return { profile };
  }
}
