import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthDocChatMessage } from '../entities/health-doc-chat-message.entity';
import { HealthDocument } from '../entities/health-document.entity';
import { HealthDocumentPage } from '../entities/health-document-page.entity';
import { DeviceKeyGuard } from '../health/device-key.guard';
import { StorageModule } from '../storage/storage.module';
import { DocumentsAdminController } from './documents-admin.controller';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HealthDocument, HealthDocumentPage, HealthDocChatMessage]),
    StorageModule,
  ],
  controllers: [DocumentsController, DocumentsAdminController],
  providers: [DocumentsService, DeviceKeyGuard],
})
export class DocumentsModule {}
