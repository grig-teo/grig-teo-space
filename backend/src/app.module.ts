import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { ContentModule } from './content/content.module';
import { CvModule } from './cv/cv.module';
import { SiteContent } from './entities/site-content.entity';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [SiteContent],
      synchronize: true,
    }),
    ContentModule,
    CvModule,
    StorageModule,
    AdminModule,
  ],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class AppModule {}
