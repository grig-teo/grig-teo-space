import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { StorageService } from '../storage/storage.service';
import { AdminAuthGuard } from './admin-auth.guard';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_PREFIXES = ['image/', 'video/', 'audio/'];
/** Document attachments (e.g. experience PDFs) are allowed on top of media. */
const ALLOWED_EXACT = ['application/pdf'];

@Controller('admin/upload')
@UseGuards(AdminAuthGuard)
export class AdminUploadController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const allowed =
      ALLOWED_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix)) ||
      ALLOWED_EXACT.includes(file.mimetype);
    if (!allowed) {
      throw new BadRequestException('Only image, video, audio, and PDF files are allowed');
    }

    const url = await this.storage.upload(file);
    return { url };
  }
}
