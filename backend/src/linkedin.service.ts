import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { SiteContent } from './entities/site-content.entity';

type LinkedInAuthState = {
  value: string;
  createdAt: number;
};

type LinkedInAuthData = {
  accessToken: string;
  expiresAt: number;
  tokenType: string;
};

export type LinkedInProfileData = {
  id?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
  picture?: string;
  locale?: string;
  headline?: string;
  vanityName?: string;
  profileUrl?: string;
};

@Injectable()
export class LinkedInService {
  private static readonly AUTH_STATE_TTL_MS = 10 * 60 * 1000;
  private static readonly pendingStates = new Map<string, number>();

  constructor(
    @InjectRepository(SiteContent)
    private readonly repo: Repository<SiteContent>,
  ) {}

  createAuthState(): LinkedInAuthState {
    const value = randomBytes(16).toString('hex');
    const createdAt = Date.now();
    LinkedInService.pendingStates.set(value, createdAt);
    return { value, createdAt };
  }

  buildAuthUrl(state: string): string {
    const clientId = this.required('LINKEDIN_CLIENT_ID');
    const redirectUri = this.required('LINKEDIN_REDIRECT_URI');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      state,
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  async completeAuth(code: string, state: string): Promise<LinkedInProfileData> {
    this.verifyState(state);

    const clientId = this.required('LINKEDIN_CLIENT_ID');
    const clientSecret = this.required('LINKEDIN_CLIENT_SECRET');
    const redirectUri = this.required('LINKEDIN_REDIRECT_URI');

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const raw = await tokenRes.text();
      throw new BadGatewayException(`LinkedIn token exchange failed: ${tokenRes.status} ${raw}`);
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    const accessToken = tokenJson.access_token?.trim();
    if (!accessToken) {
      throw new InternalServerErrorException('LinkedIn did not return access token');
    }

    const authData: LinkedInAuthData = {
      accessToken,
      expiresAt: Date.now() + (tokenJson.expires_in ?? 0) * 1000,
      tokenType: tokenJson.token_type ?? 'Bearer',
    };
    await this.saveJson('linkedin_auth', authData);

    const profile = await this.fetchOpenIdProfile(accessToken);
    await this.saveJson('linkedin_profile', profile);
    return profile;
  }

  async getStoredProfile(): Promise<LinkedInProfileData | null> {
    return this.getJson<LinkedInProfileData>('linkedin_profile');
  }

  async getProfileContextLines(): Promise<string[]> {
    const profile = await this.getStoredProfile();
    if (!profile) {
      return [];
    }

    const lines: string[] = [];
    if (profile.name) lines.push(`LinkedIn Name: ${profile.name}`);
    if (profile.givenName || profile.familyName) {
      lines.push(
        `LinkedIn Given/Family Name: ${profile.givenName ?? ''} ${profile.familyName ?? ''}`.trim(),
      );
    }
    if (profile.headline) lines.push(`LinkedIn Headline: ${profile.headline}`);
    if (profile.email) lines.push(`LinkedIn Email: ${profile.email}`);
    if (profile.locale) lines.push(`LinkedIn Locale: ${profile.locale}`);
    if (profile.vanityName) lines.push(`LinkedIn Vanity Name: ${profile.vanityName}`);
    if (profile.profileUrl) lines.push(`LinkedIn Profile URL: ${profile.profileUrl}`);
    return lines;
  }

  private verifyState(state: string): void {
    const createdAt = LinkedInService.pendingStates.get(state);
    LinkedInService.pendingStates.delete(state);
    if (!createdAt) {
      throw new BadGatewayException('Invalid LinkedIn state');
    }
    if (Date.now() - createdAt > LinkedInService.AUTH_STATE_TTL_MS) {
      throw new BadGatewayException('Expired LinkedIn state');
    }
  }

  private async fetchOpenIdProfile(accessToken: string): Promise<LinkedInProfileData> {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const raw = await res.text();
      throw new BadGatewayException(`LinkedIn profile fetch failed: ${res.status} ${raw}`);
    }

    const json = (await res.json()) as Record<string, unknown>;
    const givenName = this.asString(json.given_name);
    const familyName = this.asString(json.family_name);
    const fullName =
      this.asString(json.name) ??
      [givenName ?? '', familyName ?? '']
        .join(' ')
        .trim();

    const vanityName = this.asString(json.preferred_username);
    const profileUrl = vanityName ? `https://www.linkedin.com/in/${vanityName}` : undefined;

    return {
      id: this.asString(json.sub),
      name: fullName || undefined,
      givenName,
      familyName,
      email: this.asString(json.email),
      picture: this.asString(json.picture),
      locale: this.asString(json.locale),
      headline: this.asString(json.headline),
      vanityName,
      profileUrl,
    };
  }

  private required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new ServiceUnavailableException(`${name} is not configured`);
    }
    return value;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private async saveJson(key: string, data: unknown): Promise<void> {
    await this.repo.save({ key: key as SiteContent['key'], data });
  }

  private async getJson<T>(key: string): Promise<T | null> {
    const row = await this.repo.findOne({ where: { key: key as SiteContent['key'] } });
    if (!row?.data) {
      return null;
    }
    return row.data as T;
  }
}
