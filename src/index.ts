import { Telegraf, Context } from 'telegraf';
import { BOT_TOKEN } from './config';
import { initializeSchema } from './db';
import { whitelistGuard } from './middleware';
import { registerCommands } from './commands';
import { scheduleDaily } from './cron';

// Initialize database schema
initializeSchema().catch((error) => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

const bot = new Telegraf<Context>(BOT_TOKEN);

bot.use(whitelistGuard);
registerCommands(bot);
scheduleDaily(bot);

bot
  .launch()
  .then(() => console.log('🤖 Бот запущено!'))
  .catch((err) => {
    console.error('Bot failed to launch:', err);
    process.exit(1);
  });

process.once('SIGINT', () => {
  console.log('Shutting down (SIGINT)...');
  bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', () => {
  console.log('Shutting down (SIGTERM)...');
  bot.stop('SIGTERM');
  process.exit(0);
});

