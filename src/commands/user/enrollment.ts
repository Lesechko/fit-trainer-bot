import { Context, Telegraf } from 'telegraf';
import { db } from '../../db';
import {
  REDEEM_USAGE,
  REDEEM_INVALID,
  REDEEM_USED,
  REDEEM_OK,
  START_ASK_CODE,
  COURSE_COMPLETED_RESTART,
  COURSE_IN_PROGRESS_RESTART,
  RESTART_BUTTON_TEXT,
  CANCEL_BUTTON_TEXT,
  COURSE_NOT_FOUND,
  START_DAY_1_BUTTON_TEXT,
  START_DAY_1_MESSAGE,
} from '../../messages';
import { COURSES } from '../../config';
import { getEnrollmentStartDateForCourse } from '../../services/courseService';
import { notifyAdminNewEnrollment } from '../../services/userService';
import { getCourseProgress } from '../../services/lessonService';
import { sendDayVideoToUser } from '../../services/videoService';

export function startCommandCallback(bot: Telegraf<Context>) {
  return (ctx: Context) => {
    if (!ctx.from) {
      return;
    }

    const text = (ctx.message as any)?.text as string | undefined;
    const parts = (text || '').trim().split(/\s+/);

    if (parts.length === 2) {
      return redeemWithCode(bot, ctx, parts[1]);
    }

    ctx.reply(START_ASK_CODE);
  };
}

export function redeemCommandCallback(bot: Telegraf<Context>) {
  return (ctx: Context) => {
    if (!ctx.from) {
      return;
    }

    const text = (ctx.message as any)?.text as string | undefined;
    const parts = (text || '').trim().split(/\s+/);

    if (parts.length !== 2) {
      return ctx.reply(REDEEM_USAGE);
    }

    const code = parts[1];

    return redeemWithCode(bot, ctx, code);
  };
}

async function redeemWithCode(bot: Telegraf<Context>, ctx: Context, code: string) {
  const telegramId = ctx.from!.id;

  try {
    // Ensure user exists and fetch internal user id
    const userRes: any = await db.query(
      `INSERT INTO users (telegram_id, username, first_name, last_name, language_code, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       ON CONFLICT (telegram_id) DO UPDATE SET 
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         language_code = EXCLUDED.language_code,
         updated_at = EXCLUDED.updated_at
       RETURNING id`,
      [
        telegramId,
        ctx.from!.username || null,
        ctx.from!.first_name || null,
        ctx.from!.last_name || null,
        ctx.from!.language_code || null,
        new Date().toISOString(),
      ]
    );
    const userId: number = userRes.rows[0].id;

    // Check if user is already enrolled in any course
    const existingEnrollmentRes: any = await db.query(
      'SELECT c.title, c.id as course_id, c.slug FROM user_courses uc JOIN courses c ON c.id = uc.course_id WHERE uc.user_id = $1',
      [userId]
    );

    if (existingEnrollmentRes.rows.length > 0) {
      const existingCourse = existingEnrollmentRes.rows[0];
      
      // Get course config to check total days
      const courseConfig = COURSES.find((c) => c.slug === existingCourse.slug);
      if (!courseConfig) {
        return ctx.reply(COURSE_NOT_FOUND);
      }
      
      const totalDays = courseConfig.days.length;
      
      // Check course progress
      const progress = await getCourseProgress(userId, existingCourse.course_id, courseConfig);
      
      if (progress.isCompleted) {
        // Course is completed - offer to restart
        const restartButton = {
          text: RESTART_BUTTON_TEXT,
          callback_data: `restart_${existingCourse.course_id}_${code}`
        };
        const cancelButton = {
          text: CANCEL_BUTTON_TEXT,
          callback_data: 'cancel_restart'
        };
        
        return ctx.reply(COURSE_COMPLETED_RESTART(existingCourse.title), {
          reply_markup: {
            inline_keyboard: [[restartButton], [cancelButton]]
          }
        });
      } else {
        // Course is in progress - offer to restart
        const restartButton = {
          text: RESTART_BUTTON_TEXT,
          callback_data: `restart_${existingCourse.course_id}_${code}`
        };
        const cancelButton = {
          text: CANCEL_BUTTON_TEXT,
          callback_data: 'cancel_restart'
        };
        
        return ctx.reply(COURSE_IN_PROGRESS_RESTART(existingCourse.title, progress.currentDay, totalDays), {
          reply_markup: {
            inline_keyboard: [[restartButton], [cancelButton]]
          }
        });
      }
    }

    // Load code
    const codeRes: any = await db.query(
      'SELECT cac.id, cac.code, cac.course_id, cac.expires_at, cac.is_used, c.slug FROM course_access_codes cac JOIN courses c ON c.id = cac.course_id WHERE cac.code = $1',
      [code]
    );
    const row = codeRes.rows[0];

    if (!row) {
      return ctx.reply(REDEEM_INVALID);
    }

    if (row.is_used) {
      return ctx.reply(REDEEM_USED);
    }

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return ctx.reply(REDEEM_INVALID);
    }

    // Enroll user with start date anchored to course daily send time
    const startDate = getEnrollmentStartDateForCourse(row.slug);

    await db.query(
      'INSERT INTO user_courses (user_id, course_id, start_date) VALUES ($1, $2, $3) ON CONFLICT (user_id, course_id) DO NOTHING',
      [userId, row.course_id, startDate]
    );

    // Mark code used
    await db.query(
      'UPDATE course_access_codes SET is_used = TRUE, used_by = $1, used_at = $2 WHERE id = $3',
      [userId, new Date().toISOString(), row.id]
    );

    // Send notification to admin about new enrollment
    await notifyAdminNewEnrollment(
      bot,
      {
        telegram_id: ctx.from!.id,
        username: ctx.from!.username || null,
        first_name: ctx.from!.first_name || null,
        last_name: ctx.from!.last_name || null,
      },
      row.slug,
      startDate
    );

    const course = COURSES.find((c) => c.slug === row.slug);
    ctx.reply(REDEEM_OK(row.slug));

    if (course?.welcome) {
      await ctx.reply(course.welcome);
    }

    // Show button to start day 1
    const startButton = {
      text: START_DAY_1_BUTTON_TEXT,
      callback_data: `start_day_1_${row.course_id}`,
    };

    await ctx.reply(START_DAY_1_MESSAGE, {
      reply_markup: {
        inline_keyboard: [[startButton]],
      },
    });
  } catch (e) {
    console.error(e);
    return ctx.reply(REDEEM_INVALID);
  }
}

export async function restartCourseCallback(bot: Telegraf<Context>, ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const callbackData = (ctx.callbackQuery as any)?.data;
  
  if (!callbackData || !callbackData.startsWith('restart_')) {
    return;
  }

  try {
    // Extract course_id and code from callback data
    const parts = callbackData.split('_');
    if (parts.length !== 3) {
      return ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    }

    const courseId = parseInt(parts[1]);
    const code = parts[2];

    if (!Number.isFinite(courseId)) {
      return ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    }

    // Get user's internal ID
    const userRes: any = await db.query(
      'SELECT id FROM users WHERE telegram_id = $1',
      [ctx.from.id]
    );

    if (userRes.rows.length === 0) {
      return ctx.answerCbQuery('⚠️ Користувач не знайдений');
    }

    const userId = userRes.rows[0].id;

    // Delete existing course enrollment and completions
    await db.query(
      'DELETE FROM lesson_completions WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );
    
    await db.query(
      'DELETE FROM user_courses WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );

    // Now proceed with normal enrollment using the code
    await ctx.answerCbQuery('🔄 Курс перезапущено!');
    
    // Call redeemWithCode with the extracted code
    return redeemWithCode(bot, ctx, code);
  } catch (error) {
    console.error('Error in restartCourseCallback:', error);
    await ctx.answerCbQuery('⚠️ Помилка при перезапуску курсу');
  }
}

export async function cancelRestartCallback(ctx: Context) {
  await ctx.answerCbQuery('❌ Перезапуск скасовано');
}

export async function startDay1Callback(bot: Telegraf<Context>, ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const callbackData = (ctx.callbackQuery as any)?.data;

  if (!callbackData || !callbackData.startsWith('start_day_1_')) {
    return;
  }

  try {
    // Extract course_id from callback data
    const parts = callbackData.split('_');
    if (parts.length !== 4) {
      return ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    }

    const courseId = parseInt(parts[3]);

    if (!Number.isFinite(courseId)) {
      return ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    }

    // Get user's course info
    const telegramId = ctx.from.id;
    const userRes: any = await db.query(
      'SELECT id FROM users WHERE telegram_id = $1',
      [telegramId]
    );

    if (userRes.rows.length === 0) {
      return ctx.answerCbQuery('⚠️ Користувач не знайдений');
    }

    const userId = userRes.rows[0].id;

    // Verify user is enrolled in this course
    const enrollmentRes: any = await db.query(
      'SELECT c.slug FROM user_courses uc JOIN courses c ON c.id = uc.course_id WHERE uc.user_id = $1 AND uc.course_id = $2',
      [userId, courseId]
    );

    if (enrollmentRes.rows.length === 0) {
      return ctx.answerCbQuery('⚠️ Ви не зареєстровані на цей курс');
    }

    const courseSlug = enrollmentRes.rows[0].slug;

    // Mark that day 1 was sent manually (we'll use this to prevent scheduled job from sending it)
    // We'll track this by checking enrollment date in the scheduled job
    // For now, just send the video
    await sendDayVideoToUser(bot, telegramId, courseId, courseSlug, 1);

    // Remove the button after sending
    try {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [],
      });
    } catch (editError) {
      // If editing fails, just answer the callback query
      await ctx.answerCbQuery('✅ Перше відео надіслано!');
      return;
    }

    await ctx.answerCbQuery('✅ Перше відео надіслано!');
  } catch (error) {
    console.error('Error in startDay1Callback:', error);
    await ctx.answerCbQuery('⚠️ Помилка при надсиланні відео');
  }
}
