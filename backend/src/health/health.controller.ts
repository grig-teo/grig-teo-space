import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { DeviceKeyGuard } from './device-key.guard';
import {
  HealthService,
  type IncomingNote,
  type IncomingReading,
  type IncomingSleepSession,
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

  /**
   * Hourly average series for one metric over the last `days` days (defaults
   * to today). The iOS Profile page's stress graph reads `metric=stress&days=1`.
   * `tzOffset` is the client's offset from UTC in minutes (e.g. 180 for
   * Moscow) — buckets follow the client's local clock.
   */
  @Get('hourly')
  @UseGuards(DeviceKeyGuard)
  async hourly(
    @Query('metric') metric?: string,
    @Query('days') days?: string,
    @Query('tzOffset') tzOffset?: string,
  ) {
    const parsedDays = Number(days ?? 1);
    const parsedOffset = Number(tzOffset ?? 0);
    return this.health.getHourlySeries(
      (metric as never) ?? 'stress',
      Number.isFinite(parsedDays) ? parsedDays : 1,
      Number.isFinite(parsedOffset) ? parsedOffset : 0,
    );
  }

  /**
   * Raw (downsampled) time series for one metric over a rolling window.
   * The iOS metric detail pages read this with days = 1 / 7 / 30.
   */
  @Get('series')
  @UseGuards(DeviceKeyGuard)
  async series(
    @Query('metric') metric?: string,
    @Query('days') days?: string,
  ) {
    const parsedDays = Number(days ?? 1);
    return this.health.getMetricSeries(
      (metric as never) ?? 'stress',
      Number.isFinite(parsedDays) ? parsedDays : 1,
    );
  }

  /** Rich sleep nights (stage breakdown) uploaded by the iOS app. */
  @Post('sleep')
  @UseGuards(DeviceKeyGuard)
  @HttpCode(201)
  async addSleepSessions(@Body('sessions') sessions?: IncomingSleepSession[]) {
    if (!Array.isArray(sessions)) {
      throw new UnauthorizedException('Expected { sessions: [...] }');
    }
    return this.health.addSleepSessions(sessions);
  }

  /** Nights + aggregates for the iOS sleep page (tzOffset = local minutes). */
  @Get('sleep')
  @UseGuards(DeviceKeyGuard)
  async sleepSessions(
    @Query('days') days?: string,
    @Query('tzOffset') tzOffset?: string,
  ) {
    const parsedDays = Number(days ?? 7);
    const parsedOffset = Number(tzOffset ?? 0);
    return this.health.getSleepSessions(
      Number.isFinite(parsedDays) ? parsedDays : 7,
      Number.isFinite(parsedOffset) ? parsedOffset : 0,
    );
  }

  /** Morning recovery score + deviation alerts (iOS Profile card). */
  @Get('recovery')
  @UseGuards(DeviceKeyGuard)
  async recovery() {
    return this.health.getRecovery();
  }

  @Get('tip')
  @UseGuards(DeviceKeyGuard)
  async tip() {
    return this.health.getHourlyTip();
  }

  @Get('widget')
  @UseGuards(DeviceKeyGuard)
  async widget() {
    return this.health.getWidgetPayload();
  }

  @Get('tips')
  @UseGuards(DeviceKeyGuard)
  async tips(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.health.listTips(
      Number(limit ?? 20),
      Number(offset ?? 0),
    );
  }

  @Get('body')
  @UseGuards(DeviceKeyGuard)
  async getBody() {
    return this.health.getBodyStats();
  }

  @Put('body')
  @UseGuards(DeviceKeyGuard)
  async updateBody(@Body() body: { heightCm?: number; weightKg?: number }) {
    return this.health.updateBodyStats({
      heightCm: Number(body?.heightCm),
      weightKg: Number(body?.weightKg),
    });
  }

  @Get('public')
  async publicPayload() {
    return this.health.getPublicPayload();
  }
}
