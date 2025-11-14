import { Context, Telegraf } from 'telegraf';
import { db } from '../../db';
import { COURSES } from '../../config';
import { getDayConfig } from '../../services/courseService';

/**
 * Handle custom button callbacks (e.g., extra videos, messages, URLs)
 */
export async function customButtonCallback(bot: Telegraf<Context>, ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const callbackData = (ctx.callbackQuery as any)?.data;

  if (!callbackData || !callbackData.startsWith('custom_')) {
    return;
  }

  try {
    // Extract course_id, day, and button_id from callback data
    // Format: custom_${courseId}_${day}_${buttonId}
    // Note: buttonId may contain underscores, so we limit split to 4 parts
    const parts = callbackData.split('_', 4);
    if (parts.length !== 4) {
      return ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    }

    const courseId = parseInt(parts[1]);
    const day = parseInt(parts[2]);
    const buttonId = parts[3]; // This now correctly includes any underscores in the button ID

    if (!Number.isFinite(courseId) || !Number.isFinite(day) || !buttonId) {
      return ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    }

    const telegramId = ctx.from.id;

    // Get user's internal ID and verify enrollment in one query (optimized)
    const userEnrollmentRes: any = await db.query(
      `SELECT u.id as user_id, c.slug as course_slug 
       FROM users u
       INNER JOIN user_courses uc ON uc.user_id = u.id
       INNER JOIN courses c ON c.id = uc.course_id
       WHERE u.telegram_id = $1 AND uc.course_id = $2`,
      [telegramId, courseId]
    );

    if (userEnrollmentRes.rows.length === 0) {
      // Check if user exists at all
      const userCheckRes: any = await db.query(
        'SELECT id FROM users WHERE telegram_id = $1',
        [telegramId]
      );
      if (userCheckRes.rows.length === 0) {
        return ctx.answerCbQuery('⚠️ Користувач не знайдений');
      }
      return ctx.answerCbQuery('⚠️ Ви не зареєстровані на цей курс');
    }

    const userId = userEnrollmentRes.rows[0].user_id;
    const courseSlug = userEnrollmentRes.rows[0].course_slug;

    // Find course config and button
    const courseConfig = COURSES.find((c) => c.slug === courseSlug);
    if (!courseConfig) {
      return ctx.answerCbQuery('⚠️ Курс не знайдено');
    }

    const dayConfig = getDayConfig(courseConfig, day);
    if (!dayConfig?.customButtons) {
      return ctx.answerCbQuery('⚠️ Кнопка не знайдена');
    }

    const customButton = dayConfig.customButtons.find((b) => b.id === buttonId);
    if (!customButton) {
      return ctx.answerCbQuery('⚠️ Кнопка не знайдена');
    }

    // Handle button action first
    switch (customButton.action.type) {
      case 'video': {
        // Send extra video
        await bot.telegram.sendVideo(telegramId, customButton.action.videoFileId);
        
        // Send optional message after video
        if (customButton.action.message) {
          await bot.telegram.sendMessage(telegramId, customButton.action.message);
        }
        break;
      }
      
      case 'message': {
        // Send text message
        await bot.telegram.sendMessage(telegramId, customButton.action.text);
        break;
      }
      
      case 'url': {
        // For URL buttons, Telegram handles them natively
        // But we can still track usage
        await ctx.answerCbQuery('', { url: customButton.action.url });
        break;
      }
      
      default:
        return ctx.answerCbQuery('⚠️ Невідомий тип дії');
    }

    // For one-time buttons: remove button from message after use (no DB tracking needed)
    if (customButton.oneTime) {
      try {
        const currentKeyboard = (ctx.callbackQuery?.message as any)?.reply_markup?.inline_keyboard?.[0] || [];
        const remainingButtons = currentKeyboard.filter(
          (btn: any) => btn.callback_data !== callbackData
        );
        
        if (remainingButtons.length > 0) {
          await ctx.editMessageReplyMarkup({
            inline_keyboard: [remainingButtons],
          });
        } else {
          // No buttons left, remove them
          await ctx.editMessageReplyMarkup({
            inline_keyboard: [],
          });
        }
      } catch (editError) {
        // If editing fails, just log it (button action already completed)
        console.error('Error removing button from message:', editError);
      }
    }

    await ctx.answerCbQuery('✅');
  } catch (error) {
    console.error('Error in customButtonCallback:', error);
    await ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
  }
}

