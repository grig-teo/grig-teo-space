import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Lightweight auth guard for device/automation ingest endpoints (iOS app,
 * Telegram bot). These clients don't have an admin login, so they present a
 * shared secret in the `X-Device-Key` header instead of a JWT bearer token.
 */
@Injectable()
export class DeviceKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.DEVICE_API_KEY?.trim();
    if (!expected) {
      // Fail closed: if no device key is configured, no device may write.
      throw new UnauthorizedException('Device ingest is not configured');
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const provided = request.headers['x-device-key'];
    const candidate = Array.isArray(provided)
      ? provided[0]?.trim()
      : provided?.trim();

    if (!candidate || candidate !== expected) {
      throw new UnauthorizedException('Invalid device key');
    }
    return true;
  }
}
