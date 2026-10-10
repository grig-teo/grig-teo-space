import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';

/** Read-only graph view over the stored content (admin-only). */
@Module({
  imports: [ContentModule],
  controllers: [GraphController],
  providers: [GraphService],
})
export class GraphModule {}
