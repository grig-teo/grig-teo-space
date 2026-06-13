import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteContent } from '../entities/site-content.entity';
import { ContentService } from './content.service';
import { SeedService } from '../seed/seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([SiteContent])],
  providers: [ContentService, SeedService],
  exports: [ContentService],
})
export class ContentModule {}
