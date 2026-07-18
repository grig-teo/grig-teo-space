import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ADMIN_COOKIE } from './admin.controller';

/**
 * Reads the admin JWT from the HttpOnly cookie. Parses the Cookie header
 * manually to avoid a cookie-parser dependency.
 */
function fromAdminCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const pair of header.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name === ADMIN_COOKIE) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromAdminCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    });
  }

  validate(payload: { role?: string }) {
    if (payload.role !== 'admin') {
      throw new UnauthorizedException();
    }
    return { role: 'admin' };
  }
}
