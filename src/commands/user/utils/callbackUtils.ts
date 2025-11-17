import { Context, Telegraf } from 'telegraf';
import { QueryResult } from 'pg';
import { db } from '../../../db';
import { UserRow } from '../../../types';
import { EnrollmentRow } from './enrollmentTypes';
import { sendDayVideoToUser } from '../../../services/videoService';
import { redeemWithCode } from '../enrollment';

export async function handleRestartCourse(
  bot: Telegraf<Context>,
  ctx: Context,
  callbackData: string
): Promise<void> {
  const parts = callbackData.split('_');
  if (parts.length !== 3) {
    await ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    return;
  }

  const courseId = parseInt(parts[1]);
  const code = parts[2];

  if (!Number.isFinite(courseId)) {
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
