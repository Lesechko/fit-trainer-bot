import { Context, Telegraf } from 'telegraf';
import { QueryResult } from 'pg';
import { db } from '../../../db';
import { UserRow } from '../../../types';
import { EnrollmentRow } from './enrollmentTypes';
import { sendDayVideoToUser } from '../../../services/videoService';
import { redeemWithCode } from '../enrollment';
import { loadCourseMessages, findResponseMessageByCallback, enrichButtonsWithPaymentUrl, sendFlexibleMessage } from './messageHelpers';

export async function handleRestartCourse(
  bot: Telegraf<Context>,
  ctx: Context,
  callbackData: string
): Promise<void> {
  const parts = callbackData.split('_');
  // restart_{courseId}_{code} — code may contain underscores, so rejoin parts[2..]
  if (parts.length < 3) {
    await ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    return;
  }

  const courseId = parseInt(parts[1], 10);
  const code = parts.slice(2).join('_');

  if (!Number.isFinite(courseId) || !code) {
    await ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    return;
  }

  const userRes: QueryResult<Pick<UserRow, 'id'>> = await db.query(
    'SELECT id FROM users WHERE telegram_id = $1',
    [ctx.from!.id]
  );

  if (userRes.rows.length === 0 || !userRes.rows[0]?.id) {
    await ctx.answerCbQuery('⚠️ Користувач не знайдений');
    return;
  }

  const userId = userRes.rows[0].id;

  await db.query(
    'DELETE FROM lesson_completions WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );

  await db.query(
    'DELETE FROM user_courses WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );

  await ctx.answerCbQuery('🔄 Курс перезапущено!');
  await redeemWithCode(bot, ctx, code);
}

export async function handleStartDay1(
  bot: Telegraf<Context>,
  ctx: Context,
  callbackData: string
): Promise<void> {
  const parts = callbackData.split('_');
  if (parts.length !== 4) {
    await ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    return;
  }

  const courseId = parseInt(parts[3]);
  if (!Number.isFinite(courseId)) {
    await ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    return;
  }

  const telegramId = ctx.from!.id;
  const userRes: QueryResult<Pick<UserRow, 'id'>> = await db.query(
    'SELECT id FROM users WHERE telegram_id = $1',
    [telegramId]
  );

  if (userRes.rows.length === 0 || !userRes.rows[0]?.id) {
    await ctx.answerCbQuery('⚠️ Користувач не знайдений');
    return;
  }

  const userId = userRes.rows[0].id;

  const enrollmentRes: QueryResult<EnrollmentRow> = await db.query(
    'SELECT c.slug FROM user_courses uc JOIN courses c ON c.id = uc.course_id WHERE uc.user_id = $1 AND uc.course_id = $2',
    [userId, courseId]
  );

  if (enrollmentRes.rows.length === 0 || !enrollmentRes.rows[0]?.slug) {
    await ctx.answerCbQuery('⚠️ Ви не зареєстровані на цей курс');
    return;
  }

  const courseSlug = enrollmentRes.rows[0].slug;
  await sendDayVideoToUser(bot, telegramId, courseId, courseSlug, 1);

  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: [],
    });
  } catch (editError) {
    console.error('Error editing message:', editError);
  }
}

/**
 * Handle Instagram funnel video button click
 * Format: instagram_video_{courseSlug}
 */
export async function handleInstagramVideo(
  bot: Telegraf<Context>,
  ctx: Context,
  callbackData: string
): Promise<void> {
  try {
    if (!ctx.from) {
      return;
    }

    const telegramId = ctx.from.id;
    
    // Extract course slug from callback data
    // Format: instagram_video_{slug}
    // Note: slug may contain hyphens, so we need to handle splitting carefully
    if (!callbackData.startsWith('instagram_video_')) {
      await ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
      return;
    }

    // Extract slug by removing 'instagram_video_' prefix
    const courseSlug = callbackData.substring('instagram_video_'.length);

    // Find course config
    const { COURSES } = await import('../../../config');
    const courseConfig = COURSES.find((c) => c.slug === courseSlug);

    if (!courseConfig || !courseConfig.instagramFunnel) {
      await ctx.answerCbQuery('⚠️ Курс не знайдено');
      return;
    }

    const { videoId } = courseConfig.instagramFunnel;

    // Get video from database
    const videoRes: QueryResult<{ file_id: string }> = await db.query(
      'SELECT file_id FROM course_videos WHERE id = $1',
      [videoId]
    );

    if (videoRes.rows.length === 0) {
      await ctx.answerCbQuery('⚠️ Відео не знайдено');
      console.error(`Video with ID ${videoId} not found in database`);
      return;
    }

    const videoFileId = videoRes.rows[0].file_id;

    // Send video
    await bot.telegram.sendVideo(telegramId, videoFileId);

    // Remove button after video is sent
    try {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [],
      });
    } catch (editError) {
      // If editing fails, continue anyway (button action already completed)
      console.error('Error removing button:', editError);
    }

    await ctx.answerCbQuery('✅ Відео надіслано!');
  } catch (error) {
    console.error('Error in handleInstagramVideo:', error);
    await ctx.answerCbQuery('⚠️ Помилка при надсиланні відео');
  }
}

/**
 * Handle Instagram feedback button click
 * Format: instagram_feedback_{courseSlug}_{answerNumber}
 */
export async function handleInstagramFeedback(
  bot: Telegraf<Context>,
  ctx: Context,
  callbackData: string
): Promise<void> {
  try {
    if (!ctx.from) {
      return;
    }

    const telegramId = ctx.from.id;
    
    // Extract course slug and answer number from callback data
    // Format: instagram_feedback_{slug}_{answerNumber}
    if (!callbackData.startsWith('instagram_feedback_')) {
      await ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
      return;
    }

    // Extract slug and answer number
    // Remove 'instagram_feedback_' prefix, then find last underscore
    const remaining = callbackData.substring('instagram_feedback_'.length);
    const lastUnderscoreIndex = remaining.lastIndexOf('_');
    
    if (lastUnderscoreIndex === -1) {
      await ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
      return;
    }

    // Last part after underscore is the answer number (1-4), everything before is the slug
    const courseSlug = remaining.substring(0, lastUnderscoreIndex);
    const answerNumber = remaining.substring(lastUnderscoreIndex + 1);

    // Find course config
    const { COURSES } = await import('../../../config');
    const courseConfig = COURSES.find((c) => c.slug === courseSlug);

    if (!courseConfig || !courseConfig.siteVisitor) {
      await ctx.answerCbQuery('⚠️ Курс не знайдено');
      return;
    }

    // Load messages from JSON
    const messages = await loadCourseMessages(courseSlug);
    if (!messages?.instagramMessages) {
      await ctx.answerCbQuery('⚠️ Повідомлення не знайдено');
      return;
    }

    // Find button that matches this callback to get responseMessageId
    const responseMessage = findResponseMessageByCallback(messages.instagramMessages, callbackData);
    if (!responseMessage) {
      await ctx.answerCbQuery('⚠️ Повідомлення не знайдено');
      return;
    }

    // Handle payment URL for buttons
    enrichButtonsWithPaymentUrl(responseMessage, courseConfig.siteVisitor.paymentUrl);

    // Remove button after feedback is submitted
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch (editError) {
      console.error('Error removing button:', editError);
    }

    // Send response message
    await sendFlexibleMessage(
      bot,
      telegramId,
      responseMessage,
      courseSlug,
      messages.instagramMessages
    );

    await ctx.answerCbQuery('✅ Дякую за відгук!');
  } catch (error) {
    console.error('Error in handleInstagramFeedback:', error);
    await ctx.answerCbQuery('⚠️ Помилка при обробці відгуку');
  }
}
