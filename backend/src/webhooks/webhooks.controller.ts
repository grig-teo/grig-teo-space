import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WebhooksService, type LemniscateWebhookPayload } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  /**
   * Receives lemniscate notification webhooks (HMAC-signed POST). The
   * signature is verified against the raw body BEFORE the parsed JSON is
   * touched; verified events are forwarded to the dev Telegram bot.
   */
  @Post('lemniscate')
  async lemniscate(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() payload: LemniscateWebhookPayload,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing request body');
    }
    this.webhooks.verifySignature(req.rawBody, req.headers['x-lemniscate-signature'] as
      | string
      | undefined);
    if (!payload?.event || !payload?.title) {
      throw new BadRequestException('Malformed webhook payload');
    }
    await this.webhooks.notifyTelegram(payload);
    return { ok: true };
  }
}
