import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginAttemptTracker } from '../security/login-attempt-tracker';
import { secureCompare } from '../security/secure-compare';

/**
 * Lightweight auth guard for device/automation ingest endpoints (iOS app,
 * Telegram bot). These clients don't have an admin login, so they present a
 * shared secret in the `X-Device-Key` header instead of a JWT bearer token.
 *
 * Uses constant-time comparison (SHA-256 + timingSafeEqual) and logs every
 * failed attempt with the client IP. Repeated failures escalate to a
 * temporary ban via {@link LoginAttemptTracker}.
 */
@Injectable()
export class DeviceKeyGuard implements CanActivate {
  private readonly logger = new Logger(DeviceKeyGuard.name);

  constructor(private readonly attempts: LoginAttemptTracker) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.DEVICE_API_KEY?.trim();
    if (!expected) {
      // Fail closed: if no device key is configured, no device may write.
      throw new UnauthorizedException('Device ingest is not configured');
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      ip: string;
    }>();

    const ip = request.ip ?? 'unknown';

    // Lockout check — a temporarily banned IP is rejected immediately.
    if (this.attempts.getBanRemainingMs(ip) > 0) {
      throw new UnauthorizedException('Too many failed attempts. Try again later.');
    }

    const provided = request.headers['x-device-key'];
    const candidate = Array.isArray(provided)
      ? provided[0]?.trim()
      : provided?.trim();

    if (!candidate || !secureCompare(candidate, expected)) {
      this.attempts.recordFailure(ip);
      this.logger.warn(`Failed device-key authentication from IP ${ip}`);
      throw new UnauthorizedException('Invalid device key');
    }

    this.attempts.recordSuccess(ip);
    return true;
  }
}
