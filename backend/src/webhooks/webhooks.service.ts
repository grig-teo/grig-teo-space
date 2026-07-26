import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

/** Shape of a lemniscate webhook delivery (see notification-delivery.ts there). */
export interface LemniscateWebhookPayload {
  event: string;
  title: string;
  body: string;
  taskId: string | null;
  prUrl: string | null;
  notificationId: string | null;
  deliveryId: string | null;
}

@Injectable()
export class WebhooksService {
  /**
   * Verifies `x-lemniscate-signature` (GitHub-style `sha256=<hex>`) against
   * the exact raw request body. The secret comes from the lemniscate
   * notification channel config and lives only in env.
   */
  verifySignature(rawBody: Buffer, signature: string | undefined): void {
    const secret = process.env.LEMNISCATE_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException('LEMNISCATE_WEBHOOK_SECRET is not configured');
    }
    const expected =
      'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
    const valid =
      !!signature &&
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  /** Forwards a verified lemniscate event to the dev Telegram bot chat. */
  async notifyTelegram(payload: LemniscateWebhookPayload): Promise<void> {
    const token = process.env.DEV_TELEGRAM_BOT_TOKEN;
    const chatId = process.env.DEV_TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      throw new ServiceUnavailableException(
        'DEV_TELEGRAM_BOT_TOKEN / DEV_TELEGRAM_CHAT_ID are not configured',
      );
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: this.formatMessage(payload),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`Telegram API error ${response.status}`);
    }
  }

  private formatMessage(payload: LemniscateWebhookPayload): string {
    const lines = [`[${payload.event}] ${payload.title}`];
    if (payload.body) {
      lines.push(payload.body);
    }
    if (payload.prUrl) {
      lines.push(payload.prUrl);
    }
    return lines.join('\n');
  }
}
