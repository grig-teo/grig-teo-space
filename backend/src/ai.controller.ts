import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { AiService } from './ai.service';
import { AiRateLimiter, type AiQuotaKind } from './ai-rate-limiter';
import type { Locale } from './types';

type ChatRequest = {
  message?: string;
  locale?: string;
  sessionId?: string;
};

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly rateLimiter: AiRateLimiter,
  ) {}

  @Get('chat/history')
  async history(@Query('sessionId') sessionId?: string) {
    const messages = await this.ai.getChatHistory(sessionId ?? '');
    return { messages };
  }

  @Post('chat')
  @HttpCode(200)
  async chat(
    @Body() body: ChatRequest,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Enforce the per-IP question quota. Throws 429 when exceeded.
    const remaining = this.rateLimiter.consume(ip, 'text');
    this.setQuotaHeaders(res, 'text', remaining);

    const message = body.message?.trim() ?? '';
    if (!message) {
      return { answer: 'Please provide a message.' };
    }

    const locale = toLocale(body.locale);
    const answer = await this.ai.answerQuestion(
      message.slice(0, 2000),
      locale,
      body.sessionId ?? '',
    );
    return { answer, remaining };
  }

  /**
   * One voice turn. The browser posts a short recording; the backend
   * transcribes it and answers from the same grounded context as a typed
   * question, returning both so the client can show what it heard and speak
   * the reply.
   *
   * Voice draws on its own, larger quota: a spoken conversation of three turns
   * would not be a conversation.
   */
  @Post('voice')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      // A voice question is a few seconds of speech, so 15 MB is far more than
      // any real clip needs while still bounding what one request can allocate
      // in a container with little memory to spare.
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async voice(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ChatRequest,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Consumed before transcribing: the turn is spent whether or not the clip
    // turns out to hold speech, which is what keeps the CPU-only recognizer
    // from being hammered with junk.
    const remaining = this.rateLimiter.consume(ip, 'voice');
    this.setQuotaHeaders(res, 'voice', remaining);

    if (!file?.buffer?.length) {
      throw new BadRequestException('Expected multipart audio field "audio"');
    }

    const { transcript, answer } = await this.ai.answerVoice(
      file.buffer,
      file.originalname || 'voice.webm',
      toLocale(body.locale),
      body.sessionId ?? '',
    );
    return { transcript, answer, remaining };
  }

  /** Quota headers so the client can show what is left of each budget. */
  private setQuotaHeaders(res: Response, kind: AiQuotaKind, remaining: number): void {
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Limit', String(this.rateLimiter.limitFor(kind)));
  }
}

/** Anything that is not a supported locale falls back to English. */
function toLocale(value?: string): Locale {
  return value === 'ru' || value === 'ro' ? value : 'en';
}
