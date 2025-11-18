import { Context, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import {
  startCommandCallback,
  redeemCommandCallback,
  lessonCompletionCallback,
  disabledButtonCallback,
  restartCourseCallback,
  cancelRestartCallback,
  startDay1Callback,
} from './commands/user';
import { customButtonCallback } from './commands/user/customButtons';
import { difficultyChoiceCallback } from './commands/user/difficultyChoice';
import {
  genAccessCodeCommandCallback,
  listUsersCommandCallback,
  listCoursesCommandCallback,
  setCourseContextCommandCallback,
  syncCoursesFromConfigCommandCallback,
  contextCommandCallback,
  removeUserCommandCallback,
  sendDayToUserCommandCallback,
} from './commands/adminUsers';
import {
  videoUploadCallback,
  listVideosCommandCallback,
  addVideoCommandCallback,
  addReferenceVideoCommandCallback,
  delVideoCommandCallback,
  sendVideoBroadcastCommandCallback,
} from './commands/videos';
import { sendDailyCommandCallback } from './commands/misc';
import { ADMIN_COMMANDS_HELP } from './messages';
import { isAdmin } from './services/userService';

export function registerCommands(bot: Telegraf<Context>) {
  // User commands
  bot.start(startCommandCallback(bot));
  bot.command('redeem', redeemCommandCallback(bot));

  // Callback handlers
  bot.action(/^complete_\d+_\d+$/, lessonCompletionCallback);
  bot.action('disabled', disabledButtonCallback);
  bot.action(/^restart_\d+_.+$/, (ctx) => restartCourseCallback(bot, ctx));
  bot.action('cancel_restart', cancelRestartCallback);
  bot.action(/^start_day_1_\d+$/, (ctx) => startDay1Callback(bot, ctx));
  bot.action(/^custom_\d+_\d+_.+$/, (ctx) => customButtonCallback(bot, ctx));
  bot.action(/^difficulty_\d+_\d+_(easy|hard)$/, (ctx) => difficultyChoiceCallback(bot, ctx));

  // Admin course management
  bot.command('genaccess', genAccessCodeCommandCallback);
  bot.command('listusers', listUsersCommandCallback);
  bot.command('removeuser', removeUserCommandCallback);
  bot.command('sendday', sendDayToUserCommandCallback(bot));
  bot.command('courses', listCoursesCommandCallback);
  bot.command('setcourse', setCourseContextCommandCallback);
  bot.command('synccourses', syncCoursesFromConfigCommandCallback);
  bot.command('context', contextCommandCallback);

  // Video management commands
  bot.on(message('video'), videoUploadCallback);
  bot.command('listvideos', listVideosCommandCallback);
  bot.command('addvideo', addVideoCommandCallback);
  bot.command('addref', addReferenceVideoCommandCallback);
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
