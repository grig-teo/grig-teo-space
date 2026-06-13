import { Module } from '@nestjs/common';
import { CvService } from './cv.service';

@Module({
  providers: [CvService],
  exports: [CvService],
})
export class CvModule {}
