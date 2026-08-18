import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiRateLimiter } from './ai-rate-limiter';
import { AdminModule } from './admin/admin.module';
import { SecurityModule } from './security/security.module';
import { ContentModule } from './content/content.module';
import { CvModule } from './cv/cv.module';
import { AiChatMessage } from './entities/ai-chat-message.entity';
import { HealthDocChatMessage } from './entities/health-doc-chat-message.entity';
import { HealthDocument } from './entities/health-document.entity';
import { HealthDocumentPage } from './entities/health-document-page.entity';
import { HealthNote } from './entities/health-note.entity';
import { HealthReading } from './entities/health-reading.entity';
import { HealthTip } from './entities/health-tip.entity';
import { MediaItem } from './entities/media-item.entity';
import { SiteContent } from './entities/site-content.entity';
import { SleepSession } from './entities/sleep-session.entity';
import { WeatherSample } from './entities/weather-sample.entity';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { MediaModule } from './media/media.module';
import { LinkedInController } from './linkedin.controller';
import { LinkedInService } from './linkedin.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { StorageModule } from './storage/storage.module';
import { WeatherModule } from './weather/weather.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    // Global throttle: 300 req/min per IP by default (generous baseline that
    // covers legitimate automation — iOS app, Telegram bot, public reads).
    // Auth routes override this with a stricter limit via @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    SecurityModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [
        SiteContent,
        AiChatMessage,
        HealthReading,
        HealthNote,
        HealthDocument,
        HealthDocumentPage,
        HealthDocChatMessage,
        HealthTip,
        MediaItem,
        SleepSession,
        WeatherSample,
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
    MediaModule,
    WeatherModule,
    WebhooksModule,
  ],
  controllers: [PortfolioController, AiController, LinkedInController],
  providers: [
    PortfolioService,
    AiService,
    LinkedInService,
    AiRateLimiter,
    // Global guard: applies the ThrottlerModule config to every route.
    // Routes can override the limit with @Throttle() or opt out with
    // @SkipThrottle().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
