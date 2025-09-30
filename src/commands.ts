import { Context, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { startCommandCallback, dayCommandCallback } from './commands/user';
import {
  addUserCommandCallback,
  listUsersCommandCallback,
} from './commands/adminUsers';
import {
  videoUploadCallback,
  listVideosCommandCallback,
  addVideoCommandCallback,
  delVideoCommandCallback,
  sendVideoBroadcastCommandCallback,
} from './commands/videos';
import { sendDailyCommandCallback } from './commands/misc';

export function registerCommands(bot: Telegraf<Context>) {
  // User commands
  bot.start(startCommandCallback);
  bot.command('day', dayCommandCallback);

  // Admin user management commands
  bot.command('adduser', addUserCommandCallback);
  bot.command('listusers', listUsersCommandCallback);

  // Video management commands
  bot.on(message('video'), videoUploadCallback);
  bot.command('listvideos', listVideosCommandCallback);
  bot.command('addvideo', addVideoCommandCallback);
  bot.command('delvideo', delVideoCommandCallback);
  bot.command('sendvideo', sendVideoBroadcastCommandCallback);

  // Misc commands
  bot.command('senddaily', sendDailyCommandCallback(bot));
}
