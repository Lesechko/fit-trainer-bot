import { Context, Telegraf } from 'telegraf';
import { db } from '../../db';
import { COURSES, VIDEO_DIFFICULTY } from '../../config';
import { getDayConfig } from '../../services/courseService';
import { isLessonCompleted } from '../../services/lessonService';
import { COMPLETION_BUTTON_TEXT } from '../../messages';

/**
 * Handle difficulty choice callbacks (easy/hard video selection)
 * Format: difficulty_${courseId}_${day}_easy or difficulty_${courseId}_${day}_hard
 */
export async function difficultyChoiceCallback(
  bot: Telegraf<Context>,
  ctx: Context
) {
  if (!ctx.from) {
    return;
  }

  const callbackData =
    ctx.callbackQuery && 'data' in ctx.callbackQuery
      ? ctx.callbackQuery.data
      : undefined;

  if (!callbackData || !callbackData.startsWith('difficulty_')) {
    return;
  }

  try {
    // Extract course_id, day, and difficulty from callback data
    // Format: difficulty_${courseId}_${day}_easy or difficulty_${courseId}_${day}_hard
    const parts = callbackData.split('_');
    if (parts.length !== 4) {
      return ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    }

    const courseId = parseInt(parts[1]);
    const day = parseInt(parts[2]);
    const difficulty = parts[3]; // VIDEO_DIFFICULTY.EASY or VIDEO_DIFFICULTY.HARD

    if (
      !Number.isFinite(courseId) ||
      !Number.isFinite(day) ||
      !(Object.values(VIDEO_DIFFICULTY) as readonly string[]).includes(difficulty)
    ) {
      return ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    }

    const telegramId = ctx.from.id;

    // Get user's internal ID and verify enrollment
    const userEnrollmentRes: any = await db.query(
      `SELECT u.id as user_id, c.slug as course_slug 
       FROM users u
       INNER JOIN user_courses uc ON uc.user_id = u.id
       INNER JOIN courses c ON c.id = uc.course_id
       WHERE u.telegram_id = $1 AND uc.course_id = $2`,
      [telegramId, courseId]
    );

    if (userEnrollmentRes.rows.length === 0) {
      return ctx.answerCbQuery('⚠️ Ви не зареєстровані на цей курс');
    }

    const courseSlug = userEnrollmentRes.rows[0].course_slug;

    // Get course config
    const courseConfig = COURSES.find((c) => c.slug === courseSlug);
    if (!courseConfig) {
      return ctx.answerCbQuery('⚠️ Курс не знайдено');
    }

    // Get day config
    const dayConfig = getDayConfig(courseConfig, day);

    if (!dayConfig || !dayConfig.difficultyChoice) {
      return ctx.answerCbQuery('⚠️ Помилка конфігурації дня');
    }

    // Get the appropriate video ID from database based on difficulty
    const videoId = difficulty === VIDEO_DIFFICULTY.EASY
      ? dayConfig.difficultyChoice.easyVideoId
      : dayConfig.difficultyChoice.hardVideoId;

    // Fetch video from database
    const videoRes: any = await db.query(
      'SELECT file_id FROM course_videos WHERE id = $1 AND course_id = $2',
      [videoId, courseId]
    );

    if (videoRes.rows.length === 0) {
      return ctx.answerCbQuery('⚠️ Відео не знайдено в базі даних');
    }

    const videoFileId = videoRes.rows[0].file_id;

    // Remove the difficulty choice buttons
    try {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [],
      });
    } catch (editError) {
      // If editing fails, continue anyway (button action already completed)
      console.error('Error removing difficulty buttons:', editError);
    }

    // Send the selected video with title as caption
    await bot.telegram.sendVideo(telegramId, videoFileId, {
      caption: dayConfig.videoTitle,
    });

    // Send video description if available
    if (dayConfig.videoDescription) {
      // Get user's internal ID to check completion status
      const userId = userEnrollmentRes.rows[0].user_id;

      // Build buttons array
      const buttons: Array<{ text: string; callback_data: string }> = [];

      // Add completion button if tracking is enabled and lesson not completed
      const isCompletionTrackingEnabled =
        courseConfig.trackLessonCompletion !== false;
      if (isCompletionTrackingEnabled) {
        const isCompleted = await isLessonCompleted(userId, courseId, day);
        if (!isCompleted) {
          buttons.push({
            text: COMPLETION_BUTTON_TEXT,
            callback_data: `complete_${courseId}_${day}`,
          });
        }
      }

      // Add custom buttons if available
      if (dayConfig.customButtons && dayConfig.customButtons.length > 0) {
        for (const customButton of dayConfig.customButtons) {
          buttons.push({
            text: customButton.text,
            callback_data: `custom_${courseId}_${day}_${customButton.id}`,
          });
        }
      }

      // Send description with buttons if any, otherwise just description
      if (buttons.length > 0) {
        await bot.telegram.sendMessage(telegramId, dayConfig.videoDescription, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [buttons],
          },
        });
      } else {
        await bot.telegram.sendMessage(telegramId, dayConfig.videoDescription, {
          parse_mode: 'HTML',
        });
      }
    }

    await ctx.answerCbQuery('✅');
  } catch (error) {
    console.error('Error in difficultyChoiceCallback:', error);
    await ctx.answerCbQuery('⚠️ Помилка при надсиланні відео');
  }
}
