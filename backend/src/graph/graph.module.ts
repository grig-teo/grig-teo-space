import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentModule } from '../content/content.module';
import { AiChatMessage } from '../entities/ai-chat-message.entity';
import { HealthDocChatMessage } from '../entities/health-doc-chat-message.entity';
import { HealthDocument } from '../entities/health-document.entity';
import { HealthNote } from '../entities/health-note.entity';
import { HealthReading } from '../entities/health-reading.entity';
import { HealthTip } from '../entities/health-tip.entity';
import { MediaItem } from '../entities/media-item.entity';
import { SleepSession } from '../entities/sleep-session.entity';
import { WeatherSample } from '../entities/weather-sample.entity';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { HealthGraphService } from './health-graph.service';
import { RepoGraphService } from './repo-graph.service';

/**
 * Read-only graph view over the stored content and the health pipeline data
 * (admin-only). The health entities are registered here so the graph can
 * aggregate them without going through HealthService.
 */
@Module({
  imports: [
    ContentModule,
    TypeOrmModule.forFeature([
      HealthReading,
      HealthTip,
      SleepSession,
      HealthNote,
      HealthDocument,
      MediaItem,
      AiChatMessage,
      HealthDocChatMessage,
      WeatherSample,
    ]),
  ],
  controllers: [GraphController],
  providers: [GraphService, HealthGraphService, RepoGraphService],
})
export class GraphModule {}
