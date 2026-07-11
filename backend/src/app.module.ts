import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiRateLimiter } from './ai-rate-limiter';
import { AdminModule } from './admin/admin.module';
import { ContentModule } from './content/content.module';
import { CvModule } from './cv/cv.module';
import { AiChatMessage } from './entities/ai-chat-message.entity';
import { HealthDocChatMessage } from './entities/health-doc-chat-message.entity';
import { HealthDocument } from './entities/health-document.entity';
import { HealthNote } from './entities/health-note.entity';
import { HealthReading } from './entities/health-reading.entity';
import { SiteContent } from './entities/site-content.entity';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { LinkedInController } from './linkedin.controller';
import { LinkedInService } from './linkedin.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [
        SiteContent,
        AiChatMessage,
        HealthReading,
        HealthNote,
        HealthDocument,
        HealthDocChatMessage,
      ],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([SiteContent, AiChatMessage]),
    ContentModule,
    CvModule,
    StorageModule,
    AdminModule,
    HealthModule,
    DocumentsModule,
  ],
  controllers: [PortfolioController, AiController, LinkedInController],
  providers: [PortfolioService, AiService, LinkedInService, AiRateLimiter],
})
export class AppModule {}
