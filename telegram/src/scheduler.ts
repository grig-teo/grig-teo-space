import type { Telegraf } from 'telegraf';
import type { BackendClient, HealthSummary } from './backend-client.js';
import { formatAlerts, formatDigest } from './digest.js';

type Logger = (message: string) => void;

/**
 * Periodic background jobs:
 *  - Alerts: poll the summary every N minutes and forward any new anomaly.
 *  - Digest: once a day (at DIGEST_HOUR) send a recap to the configured chat.
 *
 * Uses setInterval + a "last sent" memory to avoid duplicate alerts.
 * Long-polling mode means the bot process is always alive, so this is fine.
 */
export class Scheduler {
  private readonly alertIntervalMs: number;
  private readonly digestHour: number;
  private lastDigestDate = '';
  private lastAlertSignature = '';
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly bot: Telegraf,
    private readonly client: BackendClient,
    private readonly chatId: string,
    private readonly log: Logger,
  ) {
    this.alertIntervalMs =
      Math.max(1, Number(process.env.ALERT_POLL_MINUTES ?? 15)) * 60 * 1000;
    this.digestHour = Math.min(23, Math.max(0, Number(process.env.DIGEST_HOUR ?? 9)));
  }

  start(): void {
    this.timers.push(setInterval(() => void this.checkAlerts(), this.alertIntervalMs));
    this.timers.push(setInterval(() => void this.maybeSendDigest(), 60 * 1000));
    this.log(
      `Scheduler started: alerts every ${this.alertIntervalMs / 60000}m, digest at ${this.digestHour}:00`,
    );
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  /** Manual trigger (used by /today and /week commands). */
  async sendDigestNow(days: number, label: string): Promise<void> {
    const summary = await this.client.getSummary(days);
    await this.bot.telegram.sendMessage(this.chatId, formatDigest(summary, label), {
      parse_mode: 'Markdown',
    });
  }

  private async checkAlerts(): Promise<void> {
    try {
      const summary = await this.client.getSummary(1);
      if (summary.alerts.length === 0) {
        this.lastAlertSignature = '';
        return;
      }
      const signature = summary.alerts
        .map((a) => `${a.metric}:${a.value}@${a.recordedAt}`)
        .join('|');
      if (signature === this.lastAlertSignature) return;
      this.lastAlertSignature = signature;

      const text = formatAlerts(summary.alerts);
      if (text) {
        await this.bot.telegram.sendMessage(this.chatId, text, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      this.log(`Alert check failed: ${(error as Error).message}`);
    }
  }

  private async maybeSendDigest(): Promise<void> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (now.getHours() !== this.digestHour || today === this.lastDigestDate) return;
    this.lastDigestDate = today;
    await this.sendDigestNow(1, 'today');
  }
}
