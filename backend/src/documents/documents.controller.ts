import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DeviceKeyGuard } from '../health/device-key.guard';
import { DocumentsService } from './documents.service';

/**
 * Device endpoints for scanned health documents (iOS app). Auth is the shared
 * device key (`X-Device-Key`), same as the ring readings.
 *
 * OCR text is extracted on-device (Apple Vision) and uploaded alongside the
 * image — the backend never runs OCR. A document may have multiple pages.
 */
@Controller('health-docs')
@UseGuards(DeviceKeyGuard)
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @HttpCode(201)
  async upload(
    @UploadedFile() image?: Express.Multer.File,
    @Body('ocrText') ocrText?: string,
    @Body('title') title?: string,
    @Body('language') language?: string,
    @Body('source') source?: 'app' | 'telegram' | 'manual',
    @Body('recordedAt') recordedAt?: string,
  ) {
    return this.docs.create({ image, ocrText, title, language, source, recordedAt });
  }

  /** Append a page (image + OCR text) to an existing document. */
  @Post(':id/pages')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @HttpCode(201)
  async addPage(
    @Param('id') id: string,
    @UploadedFile() image?: Express.Multer.File,
    @Body('ocrText') ocrText?: string,
  ) {
    return this.docs.addPage(id, { image, ocrText });
  }

  /** Document detail incl. all pages. */
  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.docs.getDetail(id);
  }

  @Get()
  async list(
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.docs.list({
      query,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  /** Permanently delete a document and all its pages. */
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.docs.delete(id);
  }

  @Post('chat')
  @HttpCode(200)
  async chat(@Body() body: { message?: string; sessionId?: string }) {
    const message = body.message?.trim() ?? '';
    if (!message) {
      return { answer: 'Please provide a message.' };
    }
    const answer = await this.docs.answerQuestion(
      message.slice(0, 2000),
      body.sessionId ?? '',
    );
    return { answer };
  }

  @Get('chat/history')
  async history(@Query('sessionId') sessionId?: string) {
    const messages = await this.docs.getChatHistory(sessionId ?? '');
    return { messages };
  }
}
