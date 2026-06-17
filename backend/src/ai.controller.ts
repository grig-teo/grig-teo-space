import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import type { Locale } from './types';

type ChatRequest = {
  message?: string;
  locale?: string;
};

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('chat')
  @HttpCode(200)
  async chat(@Body() body: ChatRequest) {
    const message = body.message?.trim() ?? '';
    if (!message) {
      return { answer: 'Please provide a message.' };
    }

    const locale: Locale = body.locale === 'ru' || body.locale === 'ro' ? body.locale : 'en';
    const answer = await this.ai.answerQuestion(message.slice(0, 2000), locale);
    return { answer };
  }
}
