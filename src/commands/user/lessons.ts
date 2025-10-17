import { Context } from 'telegraf';
import { db } from '../../db';
import {
  dayCaption,
  LESSON_COMPLETED,
  COMPLETION_ERROR,
  COMPLETION_BUTTON_TEXT,
} from '../../messages';
import { COURSES } from '../../config';
import { calculateProgramDay, isLessonCompleted } from '../../utils';

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

                  // Only show button if lesson is not completed
                  if (!isCompleted) {
                    const button = {
                      text: COMPLETION_BUTTON_TEXT,
                      callback_data: `complete_${row.course_id}_${day}`
                    };

                    await ctx.reply(courseConfig.videoDescriptions[day - 1], {
                      reply_markup: {
                        inline_keyboard: [[button]]
                      }
                    });
                  } else {
                    // Send description without button for completed lessons
                    await ctx.reply(courseConfig.videoDescriptions[day - 1]);
                  }
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

    // Remove the button entirely after completion
    try {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: []
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
  // This function is no longer used since we remove buttons entirely after completion
  // Keeping it for backward compatibility in case there are any old messages with disabled buttons
  await ctx.answerCbQuery('', { show_alert: false });
}
