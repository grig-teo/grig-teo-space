import { Telegraf } from 'telegraf';
import { BackendClient } from './backend-client.js';
import { Scheduler } from './scheduler.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function main(): Promise<void> {
  const token = required('TELEGRAM_BOT_TOKEN');
  const chatId = required('TELEGRAM_CHAT_ID');
  const deviceKey = required('DEVICE_API_KEY');
  const backendUrl = process.env.TELEGRAM_BACKEND_URL?.trim() || 'http://backend:3001';

  const client = new BackendClient(backendUrl, deviceKey);
  const bot = new Telegraf(token);

  // Restrict the bot to the configured owner so strangers can't log notes.
  const guard = (ctx: { from?: { id: number } }, reply: () => unknown): boolean => {
    if (!ctx.from || String(ctx.from.id) !== String(chatId)) {
      return false;
    }
    void reply();
    return true;
  };

  bot.start(async (ctx) => {
    if (!guard(ctx, () => undefined)) return;
    await ctx.reply(
      [
        'Health bot ready.',
        '',
        '/note <text> — log a subjective note',
        '/mood good|ok|bad — log your mood',
        '/today — today\'s summary',
        '/week — 7-day summary',
        '/help — show this help',
        '',
        'You can also just send any text and it will be saved as a note.',
      ].join('\n'),
    );
  });

  bot.help(async (ctx) => {
    if (!guard(ctx, () => undefined)) return;
    await ctx.reply('/note <text> · /mood good|ok|bad · /today · /week');
  });

  bot.command('note', async (ctx) => {
    if (!guard(ctx, () => undefined)) return;
    const text = ctx.message.text.replace(/^\/note\s*/i, '').trim();
    if (!text) {
      await ctx.reply('Usage: /note <text>');
      return;
    }
    try {
      await client.addNote(text);
      await ctx.reply('✅ Note saved');
    } catch (error) {
      await ctx.reply(`⚠️ Could not save note: ${(error as Error).message}`);
    }
  });

  bot.command('mood', async (ctx) => {
    if (!guard(ctx, () => undefined)) return;
    const arg = ctx.message.text.replace(/^\/mood\s*/i, '').trim().toLowerCase();
    const mood = ['good', 'ok', 'bad'].includes(arg) ? arg : '';
    if (!mood) {
      await ctx.reply('Usage: /mood good|ok|bad');
      return;
    }
    try {
      await client.addNote(`Mood: ${mood}`, mood);
      await ctx.reply(`✅ Mood logged: ${mood}`);
    } catch (error) {
      await ctx.reply(`⚠️ Could not log mood: ${(error as Error).message}`);
    }
  });

  bot.command('today', async (ctx) => {
    if (!guard(ctx, () => undefined)) return;
    try {
      await ctx.reply('⏳ Gathering today\'s data…');
      const scheduler = new Scheduler(bot, client, chatId, log);
      await scheduler.sendDigestNow(1, 'today');
    } catch (error) {
      await ctx.reply(`⚠️ ${(error as Error).message}`);
    }
  });

  bot.command('week', async (ctx) => {
    if (!guard(ctx, () => undefined)) return;
    try {
      await ctx.reply('⏳ Gathering the last 7 days…');
      const scheduler = new Scheduler(bot, client, chatId, log);
      await scheduler.sendDigestNow(7, 'last 7 days');
    } catch (error) {
      await ctx.reply(`⚠️ ${(error as Error).message}`);
    }
  });

  // Any plain text (not a command) is treated as a note.
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return; // unknown command — ignore
    if (!guard(ctx, () => undefined)) return;
    try {
      await client.addNote(ctx.message.text);
      await ctx.reply('✅ Saved as a note');
    } catch (error) {
      await ctx.reply(`⚠️ ${(error as Error).message}`);
    }
  });

  // Background jobs: anomaly alerts + daily digest.
  const scheduler = new Scheduler(bot, client, chatId, log);
  scheduler.start();

  // Long-polling launch (no public URL needed, unlike webhooks).
  await bot.launch();
  log(`Bot started for chat ${chatId}, backend=${backendUrl}`);

  const shutdown = (signal: string) => {
    log(`${signal} received, stopping…`);
    scheduler.stop();
    bot.stop(signal);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', error);
  process.exit(1);
});
