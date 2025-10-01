import { Context, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import {
  startCommandCallback,
  dayCommandCallback,
  redeemCommandCallback,
} from './commands/user';
import {
  addUserCommandCallback,
  listUsersCommandCallback,
  genAccessCodeCommandCallback,
  listCoursesCommandCallback,
  setCourseContextCommandCallback,
  syncCoursesFromConfigCommandCallback,
} from './commands/adminUsers';
import {
  videoUploadCallback,
  listVideosCommandCallback,
  addVideoCommandCallback,
  delVideoCommandCallback,
  sendVideoBroadcastCommandCallback,
} from './commands/videos';
import { sendDailyCommandCallback } from './commands/misc';
import { ADMIN_COMMANDS_HELP } from './messages';
import { isAdmin } from './utils';

export function registerCommands(bot: Telegraf<Context>) {
  // User commands
  bot.start(startCommandCallback);
  bot.command('day', dayCommandCallback);
  bot.command('redeem', redeemCommandCallback);

  // Admin user management & courses
  bot.command('adduser', addUserCommandCallback);
  bot.command('listusers', listUsersCommandCallback);
  bot.command('genaccess', genAccessCodeCommandCallback);
  bot.command('courses', listCoursesCommandCallback);
  bot.command('setcourse', setCourseContextCommandCallback);
  bot.command('synccourses', syncCoursesFromConfigCommandCallback);

  // Video management commands
  bot.on(message('video'), videoUploadCallback);
  bot.command('listvideos', listVideosCommandCallback);
  bot.command('addvideo', addVideoCommandCallback);
  bot.command('delvideo', delVideoCommandCallback);
  bot.command('sendvideo', sendVideoBroadcastCommandCallback);

  // Misc commands
  bot.command('senddaily', sendDailyCommandCallback(bot));

  // Admin help
  bot.command('helpadmin', (ctx) => {
    if (!ctx.from) {
      return;
    }

    if (isAdmin(ctx)) {
      return ctx.reply(ADMIN_COMMANDS_HELP);
    }
  });
}
