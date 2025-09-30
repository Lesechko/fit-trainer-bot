import { Context, Telegraf } from 'telegraf';
import { VideoRow } from '../types';
import {
  ADMIN_ONLY_LIST,
  LISTVIDEOS_ERROR,
  LISTVIDEOS_EMPTY,
  listVideos,
  ADDVIDEO_USAGE,
  ADDVIDEO_BAD_DAY,
  ADDVIDEO_ERROR,
  ADDVIDEO_SUCCESS,
  ADDVIDEO_EXISTS,
  DELVIDEO_USAGE,
  DELVIDEO_ERROR,
  DELVIDEO_SUCCESS,
  DELVIDEO_NOT_FOUND,
  SENDVIDEO_USAGE,
  SENDVIDEO_START,
  SENDVIDEO_DONE,
  SENDVIDEO_ERROR,
} from '../messages';
import { isAdmin } from '../utils';
import { db } from '../db';
import {
  ensureFromAndAdmin,
  getCommandParts,
  isValidDay,
  formatVideosList,
} from './helpers';

export function videoUploadCallback(ctx: Context) {
  const message: any = (ctx as any).message;
  const video = message?.video;

  if (video?.file_id && isAdmin(ctx)) {
    return ctx.reply(video.file_id);
  }
}

export function listVideosCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx, ADMIN_ONLY_LIST)) return;

  db.query('SELECT day, file_id FROM videos ORDER BY day')
    .then((result: any) => {
      const rows = result.rows as VideoRow[];

      if (!rows || rows.length === 0) {
        return ctx.reply(LISTVIDEOS_EMPTY);
      }

      return ctx.reply(listVideos(formatVideosList(rows)));
    })
    .catch((err: Error) => {
      console.error(err);
      ctx.reply(LISTVIDEOS_ERROR);
    });
}

export function addVideoCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx, ADMIN_ONLY_LIST)) return;

  const parts = getCommandParts(ctx);
  if (parts.length !== 3) {
    return ctx.reply(ADDVIDEO_USAGE);
  }

  const day = Number(parts[1]);
  const fileId = parts[2];

  if (!isValidDay(day)) {
    return ctx.reply(ADDVIDEO_BAD_DAY);
  }

  db.query(
    'INSERT INTO videos (day, file_id) VALUES ($1, $2) ON CONFLICT (day) DO NOTHING',
    [day, fileId]
  )
    .then((result: any) => {
      if (result.rowCount > 0) {
        ctx.reply(ADDVIDEO_SUCCESS(day));
      } else {
        ctx.reply(ADDVIDEO_EXISTS(day));
      }
    })
    .catch((err: Error) => {
      console.error(err);
      ctx.reply(ADDVIDEO_ERROR);
    });
}

export function delVideoCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx, ADMIN_ONLY_LIST)) return;

  const parts = getCommandParts(ctx);
  if (parts.length !== 2) {
    return ctx.reply(DELVIDEO_USAGE);
  }

  const day = Number(parts[1]);

  if (!isValidDay(day)) {
    return ctx.reply(ADDVIDEO_BAD_DAY);
  }

  db.query('DELETE FROM videos WHERE day = $1', [day])
    .then((result: any) => {
      if (result.rowCount > 0) {
        ctx.reply(DELVIDEO_SUCCESS(day));
      } else {
        ctx.reply(DELVIDEO_NOT_FOUND(day));
      }
    })
    .catch((err: Error) => {
      console.error(err);
      ctx.reply(DELVIDEO_ERROR);
    });
}

export async function sendVideoBroadcastCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx, ADMIN_ONLY_LIST)) return;

  const parts = getCommandParts(ctx);
  if (parts.length !== 2) {
    return ctx.reply(SENDVIDEO_USAGE);
  }

  const fileId = parts[1];
  await ctx.reply(SENDVIDEO_START);

  try {
    const res: any = await db.query('SELECT telegram_id FROM users');
    const users = res.rows as { telegram_id: number }[];

    let sent = 0;
    await Promise.all(
      users.map((u) =>
        ctx.telegram
          .sendVideo(u.telegram_id, fileId)
          .then(() => {
            sent += 1;
          })
          .catch((e: Error) => {
            console.error(`Broadcast to ${u.telegram_id} failed:`, e.message);
          })
      )
    );

    await ctx.reply(SENDVIDEO_DONE(sent));
  } catch (e) {
    console.error('Broadcast error:', e);
    await ctx.reply(SENDVIDEO_ERROR);
  }
}
