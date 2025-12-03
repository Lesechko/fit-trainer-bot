import { Telegraf, Context } from 'telegraf';
import { BOT_TOKEN } from './config';
import { initializeSchema } from './db';
import { whitelistGuard } from './middleware';
import { registerCommands } from './commands';
import { scheduleDaily } from './cron';
import { initializeWebhookServer } from './webhook';

// Handle graceful shutdown
let bot: Telegraf<Context> | null = null;

async function startBot() {
  try {
    console.log('Initializing database schema...');
    await initializeSchema();
    console.log('Database schema initialized successfully');

    bot = new Telegraf<Context>(BOT_TOKEN);

    bot.use(whitelistGuard);
    registerCommands(bot);
    scheduleDaily(bot);

    await bot.launch();
    console.log('Bot started!');

    // Initialize webhook server for WayForPay
    if (process.env.WAYFORPAY_MERCHANT_SECRET_KEY) {
      initializeWebhookServer(bot);
    }
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

void startBot();

process.once('SIGINT', () => {
  console.log('Shutting down (SIGINT)...');

  if (bot) {
    bot.stop('SIGINT');
  }

  process.exit(0);
});
process.once('SIGTERM', () => {
  console.log('Shutting down (SIGTERM)...');

  if (bot) {
    bot.stop('SIGTERM');
  }

  process.exit(0);
});
