import cron from 'node-cron';
import { Telegraf, Context } from 'telegraf';
import { TIMEZONE } from './config';
import { sendDailyVideos } from './utils';

export function scheduleDaily(bot: Telegraf<Context>) {
  cron.schedule(
    '0 9 * * *',
    async () => {
      try {
        await sendDailyVideos(bot);
      } catch (error) {
        console.error('Error in scheduleDaily:', error);
      }
    },
    { timezone: TIMEZONE }
  );
}
