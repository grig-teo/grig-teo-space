import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthNote } from '../entities/health-note.entity';
import { HealthReading } from '../entities/health-reading.entity';
import { SiteContent } from '../entities/site-content.entity';
import { DeviceKeyGuard } from './device-key.guard';
import { HealthAdminController } from './health-admin.controller';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [TypeOrmModule.forFeature([HealthReading, HealthNote, SiteContent])],
  controllers: [HealthController, HealthAdminController],
  providers: [HealthService, DeviceKeyGuard],
})
export class HealthModule {}
