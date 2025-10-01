import { Context, Telegraf } from 'telegraf';
import { SEND_DAILY_START, SEND_DAILY_COMPLETE, SEND_DAILY_ERROR } from '../messages';
import { isAdmin, sendDailyVideos } from '../utils';

export function sendDailyCommandCallback(bot: Telegraf<Context>) {
  return async (ctx: Context) => {
    if (!ctx.from) {
      return;
    }
    
    if (!isAdmin(ctx)) {
      return;
    }

    await ctx.reply(SEND_DAILY_START);

    try {
      await sendDailyVideos(bot);
      await ctx.reply(SEND_DAILY_COMPLETE);
    } catch (error) {
      console.error('Manual send daily error:', error);
      await ctx.reply(SEND_DAILY_ERROR);
    }
  };
}



