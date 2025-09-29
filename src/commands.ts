import { Context, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { ADMIN_ID } from './config';
import { db, UserDayRow, WhitelistRow, UserRow } from './db';
import {
  ACCESS_DENIED,
  ADMIN_ONLY_ADD,
  ADMIN_ONLY_LIST,
  USER_SAVE_ERROR,
  START_OK,
  NOT_REGISTERED,
  PROGRAM_COMPLETED,
  dayCaption,
  ADDUSER_USAGE,
  ADDUSER_BAD_ID,
  ADDUSER_ERROR,
  addUserOk,
  LIST_ERROR,
  LIST_EMPTY,
  listUsers,
  VIDEO_RECEIVED,
  SEND_DAILY_START,
  SEND_DAILY_COMPLETE,
  SEND_DAILY_ERROR,
  USERS_ERROR,
  USERS_EMPTY,
  usersList,
} from './messages';
import { calculateProgramDay } from './utils';

export const trainingVideos: string[] = [
  'BAACAgIAAxkBAAM5aNGli4HWgPOtwv9rO942s6vcL2kAAlSIAAI9VIlKueXyEccT_Zw2BA',
  'BAACAgIAAxkBAAMlaNGgxyMQX0yiVEA7j2PUYxy3FJ8AAjeIAAI9VIlKPsssXwAByV90NgQ',
];

export function registerCommands(bot: Telegraf<Context>) {
  bot.start((ctx: Context) => {
    if (!ctx.from) return;
    const telegramId = ctx.from.id;
    const startDate = new Date().toISOString().split('T')[0];

    db.query(
      'INSERT INTO users (telegram_id, start_date) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING',
      [telegramId, startDate]
    )
      .then(() => {
        ctx.reply(START_OK);
      })
      .catch((err: Error) => {
        console.error(err.message);
        ctx.reply(USER_SAVE_ERROR);
      });
  });

  bot.command('day', (ctx: Context) => {
    if (!ctx.from) return;
    const telegramId = ctx.from.id;
    db.query(
      'SELECT start_date FROM users WHERE telegram_id = $1',
      [telegramId]
    )
      .then((result: any) => {
        const row = result.rows[0];
        if (row?.start_date) {
          const day = calculateProgramDay(row.start_date);

          if (day <= trainingVideos.length) {
            ctx.replyWithVideo(trainingVideos[day - 1], {
              caption: dayCaption(day),
            });
          } else {
            ctx.reply(PROGRAM_COMPLETED);
          }
        } else {
          ctx.reply(NOT_REGISTERED);
        }
      })
      .catch((err: Error) => {
        console.error('Error fetching user:', err);
        ctx.reply(NOT_REGISTERED);
      });
  });

  bot.command('adduser', (ctx: Context) => {
    if (!ctx.from) return;
    if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) {
      return ctx.reply(ADMIN_ONLY_ADD);
    }

    const text = (ctx.message as any)?.text as string | undefined;
    if (!text) return ctx.reply(ADDUSER_USAGE);
    const parts = text.trim().split(/\s+/);
    if (parts.length !== 2) return ctx.reply(ADDUSER_USAGE);

    const newUserId = Number(parts[1]);
    if (!Number.isFinite(newUserId)) return ctx.reply(ADDUSER_BAD_ID);

    db.query(
      'INSERT INTO whitelist (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING',
      [newUserId]
    )
      .then(() => {
        ctx.reply(addUserOk(newUserId));
      })
      .catch((err: Error) => {
        console.error(err);
        ctx.reply(ADDUSER_ERROR);
      });
  });

  bot.command('listusers', (ctx: Context) => {
    if (!ctx.from) return;
    if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) {
      return ctx.reply(ADMIN_ONLY_LIST);
    }

    db.query('SELECT telegram_id FROM whitelist')
      .then((result: any) => {
        const rows = result.rows as WhitelistRow[];
        if (!rows || rows.length === 0) return ctx.reply(LIST_EMPTY);
        const list = rows.map((r) => String(r.telegram_id)).join('\\n');
        return ctx.reply(listUsers(list));
      })
      .catch((err: Error) => {
        console.error(err);
        ctx.reply(LIST_ERROR);
      });
  });

  // Admin command to list all users with their progress
  bot.command('users', (ctx: Context) => {
    if (!ctx.from) return;
    if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) {
      return ctx.reply(ADMIN_ONLY_LIST);
    }

    db.query('SELECT telegram_id, start_date FROM users')
      .then((result: any) => {
        const rows = result.rows as { telegram_id: number; start_date: string }[];
        if (!rows || rows.length === 0) return ctx.reply(USERS_EMPTY);

        const list = rows
          .map(
            (user) =>
              `ID: ${user.telegram_id} | День: ${calculateProgramDay(
                user.start_date
              )} | Почав: ${user.start_date}`
          )
          .join('\n');
        return ctx.reply(usersList(list));
      })
      .catch((err: Error) => {
        console.error(err);
        ctx.reply(USERS_ERROR);
      });
  });

  bot.on(message('video'), (ctx: Context) => {
    const message: any = (ctx as any).message;
    const video = message?.video;

    if (video?.file_id) {
      console.log('📂 file_id:', video.file_id);
      return ctx.reply(VIDEO_RECEIVED);
    }
  });

  // Admin command to manually send daily videos
  bot.command('senddaily', async (ctx: Context) => {
    if (!ctx.from) return;

    if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) {
      return ctx.reply(ADMIN_ONLY_LIST);
    }

    await ctx.reply(SEND_DAILY_START);

    try {
      await sendDailyVideos(bot);
      await ctx.reply(SEND_DAILY_COMPLETE);
    } catch (error) {
      console.error('Manual send daily error:', error);
      await ctx.reply(SEND_DAILY_ERROR);
    }
  });
}

export async function sendDailyVideos(bot: Telegraf<Context>): Promise<void> {
  try {
    const result: any = await db.query('SELECT telegram_id, start_date FROM users');
    const users = result.rows as { telegram_id: number; start_date: string }[];

    const promises = users.map((user) => {
      const day = calculateProgramDay(user.start_date);

      if (day <= trainingVideos.length) {
        const videoId = trainingVideos[day - 1];

        return bot.telegram
          .sendVideo(user.telegram_id, videoId, {
            caption: dayCaption(day),
          })
          .catch((sendErr: Error) => {
            console.error(
              `Помилка надсилання ${user.telegram_id}:`,
              sendErr.message
            );
          });
      }

      return Promise.resolve();
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Error in sendDailyVideos:', error);
    throw error;
  }
}
