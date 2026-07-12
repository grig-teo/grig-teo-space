import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthDocChatMessage } from '../entities/health-doc-chat-message.entity';
import { HealthDocument } from '../entities/health-document.entity';
import { HealthDocumentPage } from '../entities/health-document-page.entity';
import { HealthModule } from '../health/health.module';
import { DeviceKeyGuard } from '../health/device-key.guard';
import { StorageModule } from '../storage/storage.module';
import { DocumentsAdminController } from './documents-admin.controller';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  // HealthModule is imported so DocumentsService (the AI doctor) can read the
  // user's ring metrics + body stats and feed them as context to GLM.
  imports: [
    TypeOrmModule.forFeature([HealthDocument, HealthDocumentPage, HealthDocChatMessage]),
    StorageModule,
    HealthModule,
  ],
  controllers: [DocumentsController, DocumentsAdminController],
  providers: [DocumentsService, DeviceKeyGuard],
})
export class DocumentsModule {}
