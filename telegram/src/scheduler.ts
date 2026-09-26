import type { Telegraf } from 'telegraf';
import type { BackendClient, HealthSummary } from './backend-client.js';
import { formatAlerts, formatDigest, formatTip } from './digest.js';
import { localNow, resolveZone } from './location-time.js';
import { JobState } from './state.js';

type Logger = (message: string) => void;

/** How long a resolved timezone is trusted before it is looked up again. */
const ZONE_TTL_MS = 3 * 60 * 60 * 1000;

/**
 * Periodic background jobs:
 *  - Alerts: poll the summary every N minutes and forward any new anomaly.
 *  - Digest: once per local day, at DIGEST_HOUR on the owner's own clock.
 *  - Hourly tip: at the top of each hour, fetch a one-sentence AI health tip
 *    based on the last hour of ring data and forward it.
 *
 * Runs on setInterval with "last sent" memory. That memory is persisted to a
 * volume (see JobState) because an in-memory marker alone meant every restart
 * during the digest hour re-sent the digest.
 */
export class Scheduler {
  private readonly alertIntervalMs: number;
  private readonly digestHour: number;
  private readonly state: JobState;
  /** Per-alert dedupe memory — a new alert must not resend older ones. */
  private sentAlertKeys = new Set<string>();
  private lastTipHour = '';
  private lastTipText = '';
  /** Cached timezone for the owner's last known coordinates. */
  private zone: string | null = null;
  private zoneFetchedAt = 0;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly bot: Telegraf,
    private readonly client: BackendClient,
    private readonly chatId: string,
    private readonly log: Logger,
    statePath = process.env.SCHEDULER_STATE_PATH ?? '/app/state/scheduler.json',
  ) {
    this.state = new JobState(statePath);
    this.alertIntervalMs =
      Math.max(1, Number(process.env.ALERT_POLL_MINUTES ?? 15)) * 60 * 1000;
    // DIGEST_HOUR is the LOCAL hour at the owner's device location (the iOS app
    // pushes lat/lon), not UTC: the digest should arrive at that time on their
    // own clock, wherever they are.
    this.digestHour = Math.min(23, Math.max(0, Number(process.env.DIGEST_HOUR ?? 20)));
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
      `Scheduler started: alerts every ${this.alertIntervalMs / 60000}m, ` +
        `digest at ${this.digestHour}:00 local to the device location, hourly tip at :00`,
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
      // Only fresh readings (last 2h) and only alerts never sent before —
      // previously a single new reading re-sent the whole recent batch.
      const fresh = summary.alerts.filter(
        (a) => Date.now() - new Date(a.recordedAt).getTime() < 2 * 3600_000,
      );
      const newAlerts = fresh.filter((a) => {
        const key = `${a.metric}:${a.value}@${a.recordedAt}`;
        if (this.sentAlertKeys.has(key)) return false;
        this.sentAlertKeys.add(key);
        return true;
      });
      // Bound the memory.
      if (this.sentAlertKeys.size > 300) {
        this.sentAlertKeys = new Set([...this.sentAlertKeys].slice(-150));
      }
      if (newAlerts.length === 0) return;

      const text = formatAlerts(newAlerts);
      if (text) {
        await this.bot.telegram.sendMessage(this.chatId, text, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      this.log(`Alert check failed: ${(error as Error).message}`);
    }
  }

  /**
   * Sends the daily digest once per local day, at the configured local hour.
   *
   * The guard is checked against persisted state, so a restart (a deploy, a
   * crash) inside the digest hour cannot send it a second time.
   */
  private async maybeSendDigest(): Promise<void> {
    const zone = await this.currentZone();
    const { date, hour } = localNow(zone);
    if (hour !== this.digestHour) return;
    if (this.state.get('lastDigestDate') === date) return;

    await this.sendDigestNow(1, 'today');
    this.state.write({ lastDigestDate: date });
    this.log(`Digest sent for ${date} (${zone}, ${this.digestHour}:00 local)`);
  }

  /** The owner's timezone, refreshed occasionally from the device location. */
  private async currentZone(): Promise<string> {
    if (this.zone && Date.now() - this.zoneFetchedAt < ZONE_TTL_MS) {
      return this.zone;
    }
    try {
      const location = await this.client.getLocation();
      if (location) {
        this.zone = resolveZone(location.lat, location.lon);
        this.zoneFetchedAt = Date.now();
        this.state.write({ zone: this.zone });
        return this.zone;
      }
    } catch (error) {
      this.log(`Location lookup failed: ${(error as Error).message}`);
    }
    // Fall back to the last zone we resolved rather than jumping to UTC, which
    // would shift the send time by hours for the rest of the day.
    this.zone = this.state.get('zone') ?? 'UTC';
    return this.zone;
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
