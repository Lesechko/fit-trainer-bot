import { Context, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import {
  startCommandCallback,
  dayCommandCallback,
  redeemCommandCallback,
  lessonCompletionCallback,
  disabledButtonCallback,
  restartCourseCallback,
  cancelRestartCallback,
} from './commands/user';
import {
  genAccessCodeCommandCallback,
  listUsersCommandCallback,
  listCoursesCommandCallback,
  setCourseContextCommandCallback,
  syncCoursesFromConfigCommandCallback,
  contextCommandCallback,
  removeUserCommandCallback,
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
  bot.start(startCommandCallback(bot));
  bot.command('day', dayCommandCallback);
  bot.command('redeem', redeemCommandCallback(bot));

  // Callback handlers
  bot.action(/^complete_\d+_\d+$/, lessonCompletionCallback);
  bot.action('disabled', disabledButtonCallback);
  bot.action(/^restart_\d+_.+$/, (ctx) => restartCourseCallback(bot, ctx));
  bot.action('cancel_restart', cancelRestartCallback);

  // Admin course management
  bot.command('genaccess', genAccessCodeCommandCallback);
  bot.command('listusers', listUsersCommandCallback);
  bot.command('removeuser', removeUserCommandCallback);
  bot.command('courses', listCoursesCommandCallback);
  bot.command('setcourse', setCourseContextCommandCallback);
  bot.command('synccourses', syncCoursesFromConfigCommandCallback);
  bot.command('context', contextCommandCallback);

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
