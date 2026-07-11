import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { DeviceKeyGuard } from '../health/device-key.guard';
import { MediaService } from './media.service';

const MAX_MEDIA_SIZE = 200 * 1024 * 1024; // 200 MB — covers most phone videos.

/**
 * Device endpoints for the iOS media backup + gallery. Auth is the shared
 * device key (`X-Device-Key`), same as ring readings and health documents.
 *
 * Uploads go to a private MinIO bucket (no public-read policy); the binary is
 * only reachable through the guarded `/file` proxy below, which supports HTTP
 * Range requests so videos can seek.
 */
@Controller('media')
@UseGuards(DeviceKeyGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_MEDIA_SIZE },
    }),
  )
  @HttpCode(201)
  async upload(
    @UploadedFile() file?: Express.Multer.File,
    @Body('assetLocalId') assetLocalId?: string,
    @Body('kind') kind?: string,
    @Body('width') width?: string,
    @Body('height') height?: string,
    @Body('durationMs') durationMs?: string,
    @Body('recordedAt') recordedAt?: string,
  ) {
    return this.media.create({
      assetLocalId,
      kind,
      file,
      width,
      height,
      durationMs,
      recordedAt,
    });
  }

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('kind') kind?: string,
  ) {
    return this.media.list({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
      kind,
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const item = await this.media.findOne(id);
    return this.media.toListItem(item);
  }

  /**
   * Streams the binary privately. Supports HTTP Range so AVPlayer can seek.
   * `Head` mirrors this for size probing without a body.
   */
  @Get(':id/file')
  async file(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('range') range?: string,
  ) {
    const { stream, statusCode, headers } = await this.media.openFile(id, range);
    res.status(statusCode);
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    return new Promise<void>((resolve, reject) => {
      stream.on('error', reject);
      stream.on('end', resolve);
      stream.pipe(res);
    });
  }

  @Head(':id/file')
  async fileHead(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const item = await this.media.findOne(id);
    res.setHeader('Content-Length', String(item.byteSize));
    res.setHeader('Accept-Ranges', 'bytes');
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.media.remove(id);
  }
}
