import cron from 'node-cron';
import { Telegraf, Context } from 'telegraf';
import { TIMEZONE } from './config';
import { sendDailyVideos } from './commands';

export function scheduleDaily(bot: Telegraf<Context>) {
  cron.schedule(
    '0 9 * * *',
    async () => {
      console.log('⏰ Надсилаю щоденні відео...');
      try {
        await sendDailyVideos(bot);
        console.log('✅ Щоденні відео надіслано');
      } catch (error) {
        console.error('❌ Помилка при надсиланні щоденніх відео:', error);
      }
    },
    { timezone: TIMEZONE }
  );
}

