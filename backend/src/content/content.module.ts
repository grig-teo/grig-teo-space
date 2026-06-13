import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CvModule } from '../cv/cv.module';
import { SiteContent } from '../entities/site-content.entity';
import { ContentService } from './content.service';
import { CvInitService } from './cv-init.service';

@Module({
  imports: [TypeOrmModule.forFeature([SiteContent]), CvModule],
  providers: [ContentService, CvInitService],
  exports: [ContentService],
})
export class ContentModule {}
