import { Context, Telegraf } from 'telegraf';
import { db } from '../db';
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
  videoFileId,
} from '../messages';
import { isAdmin } from '../utils';

export function videoUploadCallback(ctx: Context) {
  const message: any = (ctx as any).message;
  const video = message?.video;
  console.log({ video, ctx });

  if (video?.file_id && isAdmin(ctx)) {
    return ctx.reply(videoFileId(video.file_id), { parse_mode: 'HTML' });
  }
}

export function listVideosCommandCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  if (!isAdmin(ctx)) {
    return ctx.reply(ADMIN_ONLY_LIST);
  }

  db.query('SELECT day, file_id FROM videos ORDER BY day')
    .then((result: any) => {
      const rows = result.rows as VideoRow[];

      if (!rows || rows.length === 0) {
        return ctx.reply(LISTVIDEOS_EMPTY);
      }

      const list = rows
        .map((r) => `День ${r.day}: ${r.file_id.substring(0, 20)}...`)
        .join('\n');
      return ctx.reply(listVideos(list));
    })
    .catch((err: Error) => {
      console.error(err);
      ctx.reply(LISTVIDEOS_ERROR);
    });
}

export function addVideoCommandCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  if (!isAdmin(ctx)) {
    return ctx.reply(ADMIN_ONLY_LIST);
  }

  const text = (ctx.message as any)?.text as string | undefined;

  if (!text) {
    return ctx.reply(ADDVIDEO_USAGE);
  }

  const parts = text.trim().split(/\s+/);

  if (parts.length !== 3) {
    return ctx.reply(ADDVIDEO_USAGE);
  }

  const day = Number(parts[1]);
  const fileId = parts[2];

  if (!Number.isFinite(day) || day < 1 || day > 10) {
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
  if (!ctx.from) {
    return;
  }

  if (!isAdmin(ctx)) {
    return ctx.reply(ADMIN_ONLY_LIST);
  }

  const text = (ctx.message as any)?.text as string | undefined;

  if (!text) {
    return ctx.reply(DELVIDEO_USAGE);
  }

  const parts = text.trim().split(/\s+/);

  if (parts.length !== 2) {
    return ctx.reply(DELVIDEO_USAGE);
  }

  const day = Number(parts[1]);

  if (!Number.isFinite(day) || day < 1 || day > 10) {
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
