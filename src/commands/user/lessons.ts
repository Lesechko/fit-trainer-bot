import { Context } from 'telegraf';
import { db } from '../../db';
import {
  LESSON_COMPLETED,
  COMPLETION_ERROR,
} from '../../messages';

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
