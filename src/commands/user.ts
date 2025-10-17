import { Context, Telegraf } from 'telegraf';
import { db } from '../db';
import {
  dayCaption,
  REDEEM_USAGE,
  REDEEM_INVALID,
  REDEEM_USED,
  REDEEM_ALREADY_ENROLLED,
  REDEEM_OK,
  START_ASK_CODE,
  LESSON_COMPLETED,
  COMPLETION_ERROR,
  COMPLETION_BUTTON_TEXT,
  COMPLETION_BUTTON_DISABLED_TEXT,
} from '../messages';
import { COURSES } from '../config';
import { calculateProgramDay, getEnrollmentStartDateForCourse, notifyAdminNewEnrollment, isLessonCompleted } from '../utils';

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

export function dayCommandCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const telegramId = ctx.from.id;

  db.query(
    `
    SELECT uc.start_date, c.slug, c.title, c.id as course_id
    FROM user_courses uc 
    JOIN courses c ON c.id = uc.course_id 
    WHERE uc.user_id = (SELECT id FROM users WHERE telegram_id = $1)
    ORDER BY uc.created_at DESC
    LIMIT 1
  `,
    [telegramId]
  )
    .then((result: any) => {
      const row = result.rows[0];
      if (row?.start_date) {
        const day = calculateProgramDay(row.start_date);

        // Get video for this day from the user's course
        return db
          .query(
            `
            SELECT cv.file_id 
            FROM course_videos cv 
            JOIN courses c ON c.id = cv.course_id 
            WHERE c.slug = $1 AND cv.day = $2
          `,
            [row.slug, day]
          )
          .then(async (videoResult: any) => {
            const videoRow = videoResult.rows[0];

            if (videoRow?.file_id) {
              // Find course config for titles and descriptions
              const courseConfig = COURSES.find((c) => c.slug === row.slug);

              // Send video with title as caption
              const videoTitle =
                courseConfig?.videoTitles && courseConfig.videoTitles[day - 1]
                  ? courseConfig.videoTitles[day - 1]
                  : dayCaption(day);

              await ctx.replyWithVideo(videoRow.file_id, {
                caption: videoTitle,
              });

              // Send video description if available
              if (
                courseConfig?.videoDescriptions &&
                courseConfig.videoDescriptions[day - 1]
              ) {
                // Get user's internal ID to check completion status
                const userRes: any = await db.query(
                  'SELECT id FROM users WHERE telegram_id = $1',
                  [telegramId]
                );
                
                if (userRes.rows.length > 0) {
                  const userId = userRes.rows[0].id;
                  const isCompleted = await isLessonCompleted(userId, row.course_id, day);

                  // Create appropriate button based on completion status
                  const button = {
                    text: isCompleted ? COMPLETION_BUTTON_DISABLED_TEXT : COMPLETION_BUTTON_TEXT,
                    callback_data: isCompleted ? 'disabled' : `complete_${row.course_id}_${day}`
                  };

                  await ctx.reply(courseConfig.videoDescriptions[day - 1], {
                    reply_markup: {
                      inline_keyboard: [[button]]
                    }
                  });
                }
              }
            }
          });
      }
    })
    .catch((err: Error) => {
      console.error('Error fetching user:', err);
    });
}

async function redeemWithCode(bot: Telegraf<Context>, ctx: Context, code: string) {
  const telegramId = ctx.from!.id;

  try {
    // Ensure user exists and fetch internal user id
    const userRes: any = await db.query(
      `INSERT INTO users (telegram_id, username, first_name, last_name, language_code, start_date, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
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
        new Date().toISOString().split('T')[0],
        new Date().toISOString(),
      ]
    );
    const userId: number = userRes.rows[0].id;

    // Check if user is already enrolled in any course
    const existingEnrollmentRes: any = await db.query(
      'SELECT c.title FROM user_courses uc JOIN courses c ON c.id = uc.course_id WHERE uc.user_id = $1',
      [userId]
    );

    if (existingEnrollmentRes.rows.length > 0) {
      const existingCourse = existingEnrollmentRes.rows[0];

      return ctx.reply(REDEEM_ALREADY_ENROLLED(existingCourse.title));
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
  } catch (e) {
    console.error(e);
    return ctx.reply(REDEEM_INVALID);
  }
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

export async function lessonCompletionCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const telegramId = ctx.from.id;
  const callbackData = (ctx.callbackQuery as any)?.data;

  if (!callbackData || !callbackData.startsWith('complete_')) {
    return;
  }

  try {
    // Extract course_id and day from callback data
    const parts = callbackData.split('_');
    if (parts.length !== 3) {
      return ctx.answerCbQuery(COMPLETION_ERROR);
    }

    const courseId = parseInt(parts[1]);
    const day = parseInt(parts[2]);

    if (!Number.isFinite(courseId) || !Number.isFinite(day)) {
      return ctx.answerCbQuery(COMPLETION_ERROR);
    }

    // Get user's internal ID
    const userRes: any = await db.query(
      'SELECT id FROM users WHERE telegram_id = $1',
      [telegramId]
    );

    if (userRes.rows.length === 0) {
      return ctx.answerCbQuery(COMPLETION_ERROR);
    }

    const userId = userRes.rows[0].id;

    // Mark lesson as completed
    await db.query(
      'INSERT INTO lesson_completions (user_id, course_id, day) VALUES ($1, $2, $3)',
      [userId, courseId, day]
    );

    // Edit the message to disable the button
    try {
      const disabledButton = {
        text: COMPLETION_BUTTON_DISABLED_TEXT,
        callback_data: 'disabled'
      };

      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[disabledButton]]
      });
    } catch (editError) {
      console.error('Error editing message:', editError);
      // If editing fails, just answer the callback query
      await ctx.answerCbQuery(LESSON_COMPLETED(day));
      return;
    }

    await ctx.answerCbQuery(LESSON_COMPLETED(day));
  } catch (error) {
    console.error('Error in lessonCompletionCallback:', error);
    await ctx.answerCbQuery(COMPLETION_ERROR);
  }
}

export async function disabledButtonCallback(ctx: Context) {
  // Handle clicks on disabled buttons - do nothing
  await ctx.answerCbQuery('', { show_alert: false });
}
