import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DeviceKeyGuard } from '../health/device-key.guard';
import { WeatherService } from './weather.service';

/**
 * Weather context for the health pipeline. All routes are device-key gated
 * (iOS app). Lives under /api/health/weather because weather only exists to
 * be correlated with health metrics.
 */
@Controller('health/weather')
@UseGuards(DeviceKeyGuard)
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  /** Hourly weather series over a rolling window (iOS "Weather & You" charts). */
  @Get()
  async series(@Query('days') days?: string) {
    const parsed = Number(days ?? 1);
    return this.weather.getSeries(Number.isFinite(parsed) ? parsed : 1);
  }

  /** Latest weather snapshot (iOS current-conditions card + LLM tip context). */
  @Get('current')
  async current() {
    return this.weather.getCurrent();
  }

  /** Weather × health-metric correlations over a rolling window. */
  @Get('correlations')
  async correlations(@Query('days') days?: string) {
    const parsed = Number(days ?? 30);
    return this.weather.getCorrelations(Number.isFinite(parsed) ? parsed : 30);
  }

  /**
   * The iOS app pushes the owner's current location here; weather collection
   * follows it. Rounded to ~100 m before storing.
   */
  @Put('location')
  async location(@Body() body: { lat?: number; lon?: number }) {
    const lat = Number(body?.lat);
    const lon = Number(body?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new BadRequestException('Expected { lat, lon }');
    }
    return this.weather.updateLocation(lat, lon);
  }
}
