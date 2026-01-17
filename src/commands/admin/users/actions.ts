import { Context, Telegraf } from 'telegraf';
import { db } from '../../../db';
import {
  REMOVEUSER_USAGE,
  REMOVEUSER_ERROR,
  REMOVEUSER_SUCCESS,
  REMOVEUSER_NOT_FOUND,
  DELETEUSER_USAGE,
  DELETEUSER_ERROR,
  DELETEUSER_SUCCESS,
  DELETEUSER_NOT_FOUND,
  SENDDAY_USAGE,
  SENDDAY_ERROR,
  SENDDAY_SUCCESS,
  SENDDAY_USER_NOT_FOUND,
  SENDDAY_INVALID_DAY,
  SENDDAY_VIDEO_NOT_FOUND,
  CONTEXT_NOT_SET,
} from '../../../messages';
import { getCommandParts, getAdminCourseContext } from '../../helpers';
import { COURSES } from '../../../config';

export async function deleteUserCommandCallback(ctx: Context) {
  const parts = getCommandParts(ctx);
  if (parts.length !== 2) {
    return ctx.reply(DELETEUSER_USAGE);
  }

  const telegramId = Number(parts[1]);
  if (!Number.isFinite(telegramId)) {
    return ctx.reply(DELETEUSER_USAGE);
  }

  try {
    const userRes: any = await db.query(
      'SELECT id FROM users WHERE telegram_id = $1',
      [telegramId]
    );

    if (userRes.rows.length === 0) {
      return ctx.reply(DELETEUSER_NOT_FOUND(telegramId));
    }

    const userId = userRes.rows[0].id;

    // Unmark access codes used by this user (so codes can be reused for testing)
    await db.query(
      'UPDATE course_access_codes SET is_used = FALSE, used_by = NULL, used_at = NULL WHERE used_by = $1',
      [userId]
    );

    // Delete user — CASCADE removes user_courses and lesson_completions
    await db.query('DELETE FROM users WHERE id = $1', [userId]);

    return ctx.reply(DELETEUSER_SUCCESS(telegramId));
  } catch (e) {
    console.error(e);
    return ctx.reply(DELETEUSER_ERROR);
  }
}

import { getDayConfig } from '../../../services/courseService';
import { sendDayVideoToUser, sendDifficultyChoiceMessage } from '../../../services/videoService';

export async function removeUserCommandCallback(ctx: Context) {
  const parts = getCommandParts(ctx);
  if (parts.length !== 2) {
    return ctx.reply(REMOVEUSER_USAGE);
  }

  const telegramId = Number(parts[1]);
  if (!Number.isFinite(telegramId)) {
    return ctx.reply(REMOVEUSER_USAGE);
  }

  try {
    const adminContext = await getAdminCourseContext(ctx.from!.id);

    if (!adminContext?.course_id) {
      return ctx.reply('⚠️ Спочатку встанови курс командою /setcourse <slug>');
    }

    // Check if user exists in the current course
    const userRes: any = await db.query(
      `
      SELECT u.id, u.telegram_id, c.title as course_title
      FROM users u 
      JOIN user_courses uc ON u.id = uc.user_id 
      JOIN courses c ON c.id = uc.course_id
      WHERE u.telegram_id = $1 AND uc.course_id = $2
    `,
      [telegramId, adminContext.course_id]
    );

    const user = userRes.rows[0];
    if (!user) {
      return ctx.reply(REMOVEUSER_NOT_FOUND(telegramId));
    }

    // Remove user from course
    await db.query(
      'DELETE FROM user_courses WHERE user_id = $1 AND course_id = $2',
      [user.id, adminContext.course_id]
    );

    return ctx.reply(REMOVEUSER_SUCCESS(telegramId, user.course_title));
  } catch (e) {
    console.error(e);
    return ctx.reply(REMOVEUSER_ERROR);
  }
}

export function sendDayToUserCommandCallback(bot: Telegraf<Context>) {
  return async (ctx: Context) => {
    const parts = getCommandParts(ctx);
    if (parts.length !== 3) {
      return ctx.reply(SENDDAY_USAGE);
    }

    const telegramId = parseInt(parts[1]);
    const day = parseInt(parts[2]);

    if (!Number.isFinite(telegramId) || !Number.isFinite(day)) {
      return ctx.reply(SENDDAY_USAGE);
    }

    if (day < 1) {
      return ctx.reply(SENDDAY_INVALID_DAY);
    }

    try {
      const adminContext = await getAdminCourseContext(ctx.from!.id);

      if (!adminContext?.course_id) {
        return ctx.reply(CONTEXT_NOT_SET);
      }

      // Verify user is enrolled in this course
      const userRes: any = await db.query(
        `
        SELECT u.telegram_id, c.slug, c.id as course_id
        FROM users u
        JOIN user_courses uc ON u.id = uc.user_id
        JOIN courses c ON c.id = uc.course_id
        WHERE u.telegram_id = $1 AND uc.course_id = $2
      `,
        [telegramId, adminContext.course_id]
      );

      if (userRes.rows.length === 0) {
        return ctx.reply(SENDDAY_USER_NOT_FOUND(telegramId));
      }

      const courseSlug = userRes.rows[0].slug;
      const courseId = userRes.rows[0].course_id;

      // Get course config and day config
      const courseConfig = COURSES.find((c) => c.slug === courseSlug);
      if (!courseConfig) {
        return ctx.reply('⚠️ Конфігурація курсу не знайдена');
      }

      const dayConfig = getDayConfig(courseConfig, day);

      // If day has difficulty choice, send message with buttons instead of video
      if (dayConfig?.difficultyChoice) {
        await sendDifficultyChoiceMessage(
          bot,
          telegramId,
          courseId,
          day,
          dayConfig.difficultyChoice
        );

        return ctx.reply(SENDDAY_SUCCESS(telegramId, day));
      }

      // Check if video exists for this day (only daily videos)
      const videoRes: any = await db.query(
        'SELECT day FROM course_videos WHERE course_id = $1 AND day = $2 AND video_type = $3',
        [courseId, day, 'daily']
      );

      if (videoRes.rows.length === 0) {
        return ctx.reply(SENDDAY_VIDEO_NOT_FOUND(day));
      }

      // Send the video
      await sendDayVideoToUser(bot, telegramId, courseId, courseSlug, day);

      return ctx.reply(SENDDAY_SUCCESS(telegramId, day));
    } catch (e) {
      console.error(e);
      return ctx.reply(SENDDAY_ERROR);
    }
  };
}
