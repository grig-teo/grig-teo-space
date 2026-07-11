import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AiService } from './ai.service';
import { AiRateLimiter } from './ai-rate-limiter';
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
    const remaining = this.rateLimiter.consume(ip);
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader(
      'X-RateLimit-Limit',
      String(AiRateLimiter.MAX_QUESTIONS),
    );

    const message = body.message?.trim() ?? '';
    if (!message) {
      return { answer: 'Please provide a message.' };
    }

    const locale: Locale = body.locale === 'ru' || body.locale === 'ro' ? body.locale : 'en';
    const answer = await this.ai.answerQuestion(
      message.slice(0, 2000),
      locale,
      body.sessionId ?? '',
    );
    return { answer, remaining };
  }
}
