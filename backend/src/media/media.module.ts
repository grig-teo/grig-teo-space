import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaItem } from '../entities/media-item.entity';
import { DeviceKeyGuard } from '../health/device-key.guard';
import { StorageModule } from '../storage/storage.module';
import { MediaAdminController } from './media-admin.controller';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [TypeOrmModule.forFeature([MediaItem]), StorageModule],
  controllers: [MediaController, MediaAdminController],
  providers: [MediaService, DeviceKeyGuard],
})
export class MediaModule {}
