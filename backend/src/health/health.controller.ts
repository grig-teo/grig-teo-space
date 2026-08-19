import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { DeviceKeyGuard } from './device-key.guard';
import { StorageService } from '../storage/storage.service';
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
  constructor(
    private readonly health: HealthService,
    private readonly storage: StorageService,
  ) {}

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

  /**
   * Uploads a note attachment (photo/video from the Telegram bot) to the
   * PRIVATE bucket — note media is personal and must never be public.
   * Returns the object key to pass as `mediaKey` to POST /notes.
   */
  @Post('notes/media')
  @UseGuards(DeviceKeyGuard)
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async uploadNoteMedia(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Expected multipart file field "file"');
    }
    return this.storage.uploadPrivate(file, 'notes/');
  }

  /** Journal notes, newest first (iOS Journal page). */
  @Get('notes')
  @UseGuards(DeviceKeyGuard)
  async listNotes(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.health.listNotes(
      Number(limit ?? 50),
      Number(offset ?? 0),
    );
  }

  /** Streams a note's photo/video from the private bucket (Range support). */
  @Get('notes/:id/media')
  @UseGuards(DeviceKeyGuard)
  async noteMedia(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('range') range?: string,
  ) {
    const { stream, statusCode, headers } = await this.health.openNoteMedia(id, range);
    res.status(statusCode);
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    return new Promise<void>((resolve, reject) => {
      stream.on('error', reject);
      stream.on('end', resolve);
      stream.pipe(res);
    });
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

  /** Recent anomaly alerts, newest first (iOS alerts card + notifications). */
  @Get('alerts')
  @UseGuards(DeviceKeyGuard)
  async recentAlerts(@Query('hours') hours?: string) {
    const parsed = Number(hours ?? 24);
    return this.health.getRecentAlerts(Number.isFinite(parsed) ? parsed : 24);
  }

  /** Morning recovery score + deviation alerts (iOS Profile card). */
  @Get('recovery')
  @UseGuards(DeviceKeyGuard)
  async recovery() {
    return this.health.getRecovery();
  }

  /** Step-goal streak + today's progress (iOS Profile streak card). */
  @Get('insights')
  @UseGuards(DeviceKeyGuard)
  async insights(@Query('tzOffset') tzOffset?: string) {
    const parsed = Number(tzOffset ?? 0);
    return this.health.getInsights(Number.isFinite(parsed) ? parsed : 0);
  }

  /** LLM weekly digest, cached 12h (iOS Profile card + Telegram /week). */
  @Get('digest')
  @UseGuards(DeviceKeyGuard)
  async digest() {
    return this.health.getDigest();
  }

  /** Auto-detected activity windows (HR spike + step rate). */
  @Get('activities')
  @UseGuards(DeviceKeyGuard)
  async activities(@Query('days') days?: string) {
    const parsed = Number(days ?? 7);
    return this.health.getActivities(Number.isFinite(parsed) ? parsed : 7);
  }

  /** Year-in-review stats (iOS Year page). */
  @Get('year')
  @UseGuards(DeviceKeyGuard)
  async year(@Query('tzOffset') tzOffset?: string) {
    const parsed = Number(tzOffset ?? 0);
    return this.health.getYearReview(Number.isFinite(parsed) ? parsed : 0);
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
