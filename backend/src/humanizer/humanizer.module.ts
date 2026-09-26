import { Module } from '@nestjs/common';
import { HumanizerService } from './humanizer.service';

@Module({
  providers: [HumanizerService],
  exports: [HumanizerService],
})
export class HumanizerModule {}
