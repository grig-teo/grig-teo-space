import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AdminModule } from './admin/admin.module';
import { ContentModule } from './content/content.module';
import { CvModule } from './cv/cv.module';
import { AiChatMessage } from './entities/ai-chat-message.entity';
import { SiteContent } from './entities/site-content.entity';
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
      entities: [SiteContent, AiChatMessage],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([SiteContent, AiChatMessage]),
    ContentModule,
    CvModule,
    StorageModule,
    AdminModule,
  ],
  controllers: [PortfolioController, AiController, LinkedInController],
  providers: [PortfolioService, AiService, LinkedInService],
})
export class AppModule {}
