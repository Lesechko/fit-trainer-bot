import { Context, Telegraf } from 'telegraf';
import { QueryResult } from 'pg';
import { db } from '../../db';
import { COURSES } from '../../config';
import { CourseVideoRow, CourseRow } from '../../types';

/**
 * Handle review completion callback
 * Format: review_completed_${courseId}
 */
export async function reviewCompletionCallback(
  bot: Telegraf<Context>,
  ctx: Context
) {
  if (!ctx.from) return;

  const callbackData =
    ctx.callbackQuery && 'data' in ctx.callbackQuery
      ? ctx.callbackQuery.data
      : undefined;
  const courseId = parseInt(callbackData?.split('_')[2] || '0');

  if (!courseId) return;

  try {
    const telegramId = ctx.from.id;

    // Get course config
    const courseRes: QueryResult<Pick<CourseRow, 'slug'>> = await db.query(
      'SELECT slug FROM courses WHERE id = $1',
      [courseId]
    );
    const courseConfig = COURSES.find(
      (c) => c.slug === courseRes.rows[0]?.slug
    );
    if (!courseConfig?.bonusVideoId) {
      return ctx.answerCbQuery('✅ Дякую за відгук!');
    }

    // Remove button
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

    // Send bonus video
    const videoRes: QueryResult<Pick<CourseVideoRow, 'file_id'>> =
      await db.query(
        'SELECT file_id FROM course_videos WHERE id = $1 AND course_id = $2',
        [courseConfig.bonusVideoId, courseId]
      );

    if (videoRes.rows[0]?.file_id) {
      await bot.telegram.sendVideo(telegramId, videoRes.rows[0].file_id, {
        caption: '🎁 Бонусне відео для тебе! Дякую за відгук! 💙',
        parse_mode: 'HTML',
      });
    }

    await ctx.answerCbQuery('✅ Дякую за відгук!');
  } catch (error) {
    console.error('Error in reviewCompletionCallback:', error);
    await ctx.answerCbQuery('⚠️ Помилка');
  }
}
