import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { DeviceKeyGuard } from './device-key.guard';
import {
  HealthService,
  type IncomingNote,
  type IncomingReading,
} from './health.service';

/**
 * Device + public endpoints for the health pipeline.
 *
 * - Ingest (POST readings/notes) and summary are gated by a shared
 *   device key (X-Device-Key header) used by the iOS app and Telegram bot.
 * - The public endpoint is unauthenticated and only returns metrics the
 *   admin has explicitly opted in to expose.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Post('readings')
  @UseGuards(DeviceKeyGuard)
  @HttpCode(201)
  async addReadings(@Body('readings') readings?: IncomingReading[]) {
    if (!Array.isArray(readings)) {
      throw new UnauthorizedException('Expected { readings: [...] }');
    }
    const result = await this.health.addReadings(readings);
    return result;
  }

  @Post('notes')
  @UseGuards(DeviceKeyGuard)
  @HttpCode(201)
  async addNote(@Body() body: IncomingNote) {
    return this.health.addNote(body);
  }

  @Get('summary')
  @UseGuards(DeviceKeyGuard)
  async summary(@Query('days') days?: string) {
    const parsed = Number(days ?? 7);
    return this.health.getSummary(Number.isFinite(parsed) ? parsed : 7);
  }

  @Get('public')
  async publicPayload() {
    return this.health.getPublicPayload();
  }
}
