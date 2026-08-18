import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthNote } from '../entities/health-note.entity';
import { HealthReading } from '../entities/health-reading.entity';
import { HealthTip } from '../entities/health-tip.entity';
import { SiteContent } from '../entities/site-content.entity';
import { SleepSession } from '../entities/sleep-session.entity';
import { DeviceKeyGuard } from './device-key.guard';
import { HealthAdminController } from './health-admin.controller';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { StorageModule } from '../storage/storage.module';
import { WeatherModule } from '../weather/weather.module';

@Module({
  // HealthTip is registered here so HealthService can persist tips. HealthService
  // is exported so DocumentsService (the AI doctor) can read ring + body context.
  // WeatherModule feeds current conditions into the hourly tip context.
  // StorageModule stores note attachments in the private media bucket.
  imports: [
    TypeOrmModule.forFeature([HealthReading, HealthNote, HealthTip, SiteContent, SleepSession]),
    WeatherModule,
    StorageModule,
  ],
  controllers: [HealthController, HealthAdminController],
  providers: [HealthService, DeviceKeyGuard],
  exports: [HealthService],
})
export class HealthModule {}
