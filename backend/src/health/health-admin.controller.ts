import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import {
  HealthService,
  type HealthPublicConfig,
} from './health.service';

@Controller('admin/health')
@UseGuards(AdminAuthGuard)
export class HealthAdminController {
  constructor(private readonly health: HealthService) {}

  @Get('overview')
  async overview(@Query('days') days?: string) {
    const parsed = Number(days ?? 7);
    return this.health.getOverview(Number.isFinite(parsed) ? parsed : 7);
  }

  @Get('config')
  async getConfig() {
    return this.health.getPublicConfig();
  }

  @Put('config')
  async updateConfig(@Body() config: HealthPublicConfig) {
    return this.health.updatePublicConfig(config);
  }
}
