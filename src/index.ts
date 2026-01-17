import { Telegraf, Context } from 'telegraf';
import { BOT_TOKEN } from './config';
import { initializeSchema, migrateTelegramIdToBigint } from './db';
import { runMigrations } from './db/migrations';
import { whitelistGuard } from './middleware';
import { registerCommands } from './commands';
import { scheduleDaily } from './cron';

async function startBot() {
  try {
    console.log('Initializing database schema...');
    await initializeSchema();
    console.log('Database schema initialized successfully');

    // Run one-off migration to ensure telegram_id columns are BIGINT on existing DBs.
    // Safe to keep during deploys; it becomes a no-op once columns are already BIGINT.
    await migrateTelegramIdToBigint();

    // Run database migrations
    await runMigrations();

    bot = new Telegraf<Context>(BOT_TOKEN);

    bot.use(whitelistGuard);
    registerCommands(bot);
    scheduleDaily(bot);

    await bot.launch();
    console.log('Bot started!');
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

startBot();

// Handle graceful shutdown
let bot: Telegraf<Context> | null = null;

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
