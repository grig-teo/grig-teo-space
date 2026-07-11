import {
  Body,
  Controller,
  Get,
  HttpCode,
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
 * image — the backend never runs OCR.
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
