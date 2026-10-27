import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

@Module({
  imports: [ContentModule],
  controllers: [LearningController],
  providers: [LearningService],
})
export class LearningModule {}
