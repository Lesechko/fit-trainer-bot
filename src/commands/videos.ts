import { Context } from 'telegraf';
import type { Message } from 'telegraf/types';
import { QueryResult } from 'pg';
import { CourseVideoRow } from '../types';
import {
  LISTVIDEOS_ERROR,
  LISTVIDEOS_EMPTY,
  listVideos,
  ADDVIDEO_USAGE,
  ADDVIDEO_BAD_DAY,
  ADDVIDEO_ERROR,
  ADDVIDEO_SUCCESS,
  DELVIDEO_USAGE,
  DELVIDEO_ERROR,
  DELVIDEO_SUCCESS,
  DELVIDEO_NOT_FOUND,
  SENDVIDEO_USAGE,
  SENDVIDEO_START,
  SENDVIDEO_DONE,
  SENDVIDEO_ERROR,
} from '../messages';
import { isAdmin } from '../services/userService';
import { db } from '../db';
import {
  ensureFromAndAdmin,
  getCommandParts,
  isValidDay,
  getAdminCourseContext,
} from './helpers';

export function videoUploadCallback(ctx: Context) {
  const message = ctx.message as Message.VideoMessage | undefined;
  const video = message?.video;

  if (video?.file_id && isAdmin(ctx)) {
    return ctx.reply(video.file_id);
  }
}

export async function listVideosCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx)) return;

  try {
    const adminContext = await getAdminCourseContext(ctx.from!.id);
    if (!adminContext?.course_id) {
      return ctx.reply('⚠️ Спочатку встанови курс командою /setcourse <slug>');
    }

    const result: QueryResult<CourseVideoRow & { slug: string }> =
      await db.query(
        'SELECT cv.id, cv.day, cv.file_id, c.slug FROM course_videos cv JOIN courses c ON c.id = cv.course_id WHERE cv.course_id = $1 ORDER BY cv.day',
        [adminContext.course_id]
      );
    const rows = result.rows;

    if (!rows || rows.length === 0) {
      return ctx.reply(LISTVIDEOS_EMPTY);
    }

    const list = rows
      .map((r) => {
        return `День ${r.day}: ID ${r.id} (${r.file_id.substring(0, 20)}...)`;
      })
      .join('\n');
    return ctx.reply(listVideos(list));
  } catch (err) {
    console.error(err);
    void ctx.reply(LISTVIDEOS_ERROR);
  }
}

export async function addVideoCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx)) return;

  const parts = getCommandParts(ctx);
  if (parts.length !== 3) {
    return ctx.reply(ADDVIDEO_USAGE);
  }

  const day = Number(parts[1]);
  const fileId = parts[2];

  if (!isValidDay(day)) {
    return ctx.reply(ADDVIDEO_BAD_DAY);
  }

  try {
    const adminContext = await getAdminCourseContext(ctx.from!.id);
    if (!adminContext?.course_id) {
      return ctx.reply('⚠️ Спочатку встанови курс командою /setcourse <slug>');
    }

    // Simple: one video per day, overwrite if exists
    const result: QueryResult<{ id: number }> = await db.query(
      'INSERT INTO course_videos (course_id, day, file_id) VALUES ($1, $2, $3) ON CONFLICT (course_id, day) DO UPDATE SET file_id = EXCLUDED.file_id RETURNING id',
      [adminContext.course_id, day, fileId]
    );

    if (result.rowCount && result.rowCount > 0) {
      const videoId = result.rows[0]?.id;
      if (videoId) {
        void ctx.reply(ADDVIDEO_SUCCESS(day) + ` (ID: ${videoId})`);
      }
    }
  } catch (err) {
    console.error(err);
    void ctx.reply(ADDVIDEO_ERROR);
  }
}

export async function delVideoCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx)) return;

  const parts = getCommandParts(ctx);
  if (parts.length !== 2) {
    return ctx.reply(DELVIDEO_USAGE);
  }

  const day = Number(parts[1]);

  if (!isValidDay(day)) {
    return ctx.reply(ADDVIDEO_BAD_DAY);
  }

  try {
    const adminContext = await getAdminCourseContext(ctx.from!.id);
    if (!adminContext?.course_id) {
      return ctx.reply('⚠️ Спочатку встанови курс командою /setcourse <slug>');
    }

    const result: QueryResult = await db.query(
      'DELETE FROM course_videos WHERE course_id = $1 AND day = $2',
      [adminContext.course_id, day]
    );

    if (result.rowCount && result.rowCount > 0) {
      void ctx.reply(DELVIDEO_SUCCESS(day));
    } else {
      void ctx.reply(DELVIDEO_NOT_FOUND(day));
    }
  } catch (err) {
    console.error(err);
    void ctx.reply(DELVIDEO_ERROR);
  }
}

export async function sendVideoBroadcastCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx)) return;

  const parts = getCommandParts(ctx);
  if (parts.length !== 2) {
    return ctx.reply(SENDVIDEO_USAGE);
  }

  const fileId = parts[1];
  await ctx.reply(SENDVIDEO_START);

  try {
    const adminContext = await getAdminCourseContext(ctx.from!.id);
    if (!adminContext?.course_id) {
      return ctx.reply('⚠️ Спочатку встанови курс командою /setcourse <slug>');
    }

    const res: QueryResult<{ telegram_id: number }> = await db.query(
      'SELECT u.telegram_id FROM users u JOIN user_courses uc ON u.id = uc.user_id WHERE uc.course_id = $1',
      [adminContext.course_id]
    );
    const users = res.rows;

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
