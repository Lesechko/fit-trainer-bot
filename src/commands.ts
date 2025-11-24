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
  reviewCompletionCallback,
} from './commands/user';
import { customButtonCallback } from './commands/user/customButtons';
import { difficultyChoiceCallback } from './commands/user/difficultyChoice';
import {
  genAccessCodeCommandCallback,
  listUsersCommandCallback,
  listUsersPaginationCallback,
  listCoursesCommandCallback,
  setCourseContextCommandCallback,
  syncCoursesFromConfigCommandCallback,
  contextCommandCallback,
  removeUserCommandCallback,
  sendDayToUserCommandCallback,
} from './commands/adminUsers';
import {
  videoUploadCallback,
  photoUploadCallback,
  listVideosCommandCallback,
  addVideoCommandCallback,
  addReferenceVideoCommandCallback,
  delVideoCommandCallback,
  sendVideoBroadcastCommandCallback,
} from './commands/videos';
import { sendDailyCommandCallback } from './commands/misc';
import { ADMIN_COMMANDS_HELP } from './messages';
import { adminGuard } from './commands/helpers';

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
  bot.action(/^review_completed_\d+$/, (ctx) => reviewCompletionCallback(bot, ctx));
  bot.action(/^listusers_page_\d+/, adminGuard(listUsersPaginationCallback));

  // Admin course management
  bot.command('genaccess', adminGuard(genAccessCodeCommandCallback));
  bot.command('listusers', adminGuard(listUsersCommandCallback));
  bot.command('removeuser', adminGuard(removeUserCommandCallback));
  bot.command('sendday', adminGuard(sendDayToUserCommandCallback(bot)));
  bot.command('courses', adminGuard(listCoursesCommandCallback));
  bot.command('setcourse', adminGuard(setCourseContextCommandCallback));
  bot.command('synccourses', adminGuard(syncCoursesFromConfigCommandCallback));
  bot.command('context', adminGuard(contextCommandCallback));

  // Video management commands
  bot.on(message('video'), videoUploadCallback);
  bot.on(message('photo'), photoUploadCallback);
  bot.command('listvideos', adminGuard(listVideosCommandCallback));
  bot.command('addvideo', adminGuard(addVideoCommandCallback));
  bot.command('addref', adminGuard(addReferenceVideoCommandCallback));
  bot.command('delvideo', adminGuard(delVideoCommandCallback));
  bot.command('sendvideo', adminGuard(sendVideoBroadcastCommandCallback));

  // Misc commands
  bot.command('senddaily', adminGuard(sendDailyCommandCallback(bot)));

  // Admin help
  bot.command('helpadmin', adminGuard((ctx) => {
    return ctx.reply(ADMIN_COMMANDS_HELP);
  }));
}
