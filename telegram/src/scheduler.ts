import type { Telegraf } from 'telegraf';
import type { BackendClient, HealthSummary } from './backend-client.js';
import { formatAlerts, formatDigest, formatTip } from './digest.js';

type Logger = (message: string) => void;

/**
 * Periodic background jobs:
 *  - Alerts: poll the summary every N minutes and forward any new anomaly.
 *  - Digest: once a day (at DIGEST_HOUR) send a recap to the configured chat.
 *  - Hourly tip: at the top of each hour, fetch a one-sentence AI health tip
 *    based on the last hour of ring data and forward it.
 *
 * Uses setInterval + a "last sent" memory to avoid duplicate alerts.
 * Long-polling mode means the bot process is always alive, so this is fine.
 */
export class Scheduler {
  private readonly alertIntervalMs: number;
  private readonly digestHour: number;
  private lastDigestDate = '';
  private lastAlertSignature = '';
  private lastTipHour = '';
  private lastTipText = '';
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly bot: Telegraf,
    private readonly client: BackendClient,
    private readonly chatId: string,
    private readonly log: Logger,
  ) {
    this.alertIntervalMs =
      Math.max(1, Number(process.env.ALERT_POLL_MINUTES ?? 15)) * 60 * 1000;
    // DIGEST_HOUR is interpreted as UTC — all health-pipeline day math is UTC.
    this.digestHour = Math.min(23, Math.max(0, Number(process.env.DIGEST_HOUR ?? 9)));
  }

  start(): void {
    this.timers.push(setInterval(() => void this.checkAlerts(), this.alertIntervalMs));
    this.timers.push(
      setInterval(() => {
        void this.maybeSendDigest();
        void this.maybeSendTip();
      }, 60 * 1000),
    );
    this.log(
      `Scheduler started: alerts every ${this.alertIntervalMs / 60000}m, digest at ${this.digestHour}:00 UTC, hourly tip at :00`,
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
    if (now.getUTCHours() !== this.digestHour || today === this.lastDigestDate) return;
    this.lastDigestDate = today;
    await this.sendDigestNow(1, 'today');
  }

  /**
   * Fires once at the top of each hour. Fetches an AI health tip from the
   * backend and forwards it as plain text. Stays silent when the backend
   * reports no fresh data, and skips if the tip is identical to last hour's.
   */
  private async maybeSendTip(): Promise<void> {
    const now = new Date();
    if (now.getMinutes() !== 0) return;
    const hourKey = now.toISOString().slice(0, 13);
    if (hourKey === this.lastTipHour) return;
    this.lastTipHour = hourKey;

    try {
      const result = await this.client.getHourlyTip();
      if (!result.tip) return;
      if (result.tip === this.lastTipText) return;
      this.lastTipText = result.tip;
      // Plain text — no parse_mode — so model output never breaks formatting.
      await this.bot.telegram.sendMessage(
        this.chatId,
        formatTip(result.tip, result.generatedAt),
      );
    } catch (error) {
      this.log(`Hourly tip failed: ${(error as Error).message}`);
    }
  }
}
