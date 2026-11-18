import { Context, Telegraf } from 'telegraf';
import {
  REDEEM_USAGE,
  REDEEM_INVALID,
  START_ASK_CODE,
  START_MEMBER_CONNECTED,
} from '../../messages';
import { getEnrollmentStartDateForCourse } from '../../services/courseService';
import { ensureUserExists } from './utils/userUtils';
import { handleExistingEnrollment, enrollUserInCourse } from './utils/enrollmentUtils';
import { validateAndLoadCode, processUsedCode } from './utils/codeUtils';
import { sendEnrollmentConfirmation } from './utils/enrollmentNotifications';
import { handleRestartCourse, handleStartDay1, handleInstagramVideo, handleInstagramFeedback } from './utils/callbackUtils';
import { getCommandParam } from './utils/enrollmentHelpers';
import { resolveStartRoute } from './utils/startRoute';
import { handleSiteUser } from './utils/siteVisitor';
import { handlePaymentCompletion } from './utils/paymentCompletion';
import { handleInstagramFunnel } from './utils/instagramFunnel';

export function startCommandCallback(bot: Telegraf<Context>) {
  return (ctx: Context) => {
    if (!ctx.from) {
      return;
    }

    const route = resolveStartRoute(getCommandParam(ctx));
    switch (route.kind) {
      case 'ask_code':
        void ctx.reply(START_ASK_CODE);
        return;
      case 'member':
        // Soft landing for cabinet reminders — no enroll, no access-code prompt.
        void ctx.reply(START_MEMBER_CONNECTED);
        return;
      case 'paid':
        return handlePaymentCompletion(bot, ctx, route.slug);
      case 'site':
        return handleSiteUser(ctx, route.slug);
      case 'instagram':
        return handleInstagramFunnel(bot, ctx, route.slug);
      case 'access_code':
        return redeemWithCode(bot, ctx, route.code);
      default: {
        const _exhaustive: never = route;
        return _exhaustive;
      }
    }
  };
}


export function redeemCommandCallback(bot: Telegraf<Context>) {
  return (ctx: Context) => {
    if (!ctx.from) {
      return;
    }

    const text =
      ctx.message && 'text' in ctx.message
        ? (ctx.message as { text: string }).text
        : undefined;
    const parts = (text || '').trim().split(/\s+/);

    if (parts.length !== 2) {
      return ctx.reply(REDEEM_USAGE);
    }

    const code = parts[1];

    return redeemWithCode(bot, ctx, code);
  };
}

export async function redeemWithCode(
  bot: Telegraf<Context>,
  ctx: Context,
  code: string
) {
  try {
    const userId = await ensureUserExists(ctx);
    if (!userId) {
      return ctx.reply(REDEEM_INVALID);
    }

    const validationResult = await validateAndLoadCode(code, userId);

    if (!validationResult.codeRow) {
      return ctx.reply(REDEEM_INVALID);
    }

    const codeRow = validationResult.codeRow;

    if (validationResult.isUsed) {
      const isAlreadyEnrolled = await processUsedCode(userId, codeRow);

      if (isAlreadyEnrolled) {
        return;
      }

      return ctx.reply(REDEEM_INVALID);
    }

    const shouldContinue = await handleExistingEnrollment(ctx, userId, codeRow);

    if (!shouldContinue) {
      return;
    }

    const startDate = getEnrollmentStartDateForCourse(codeRow.slug);
    // Update entry_source if user came from Instagram (they're now enrolled via code)
    await enrollUserInCourse(userId, codeRow, startDate, 'code');
    await sendEnrollmentConfirmation(bot, ctx, codeRow, startDate);
  } catch (e) {
    console.error(e);
    return ctx.reply(REDEEM_INVALID);
  }
}

export async function restartCourseCallback(
  bot: Telegraf<Context>,
  ctx: Context
) {
  if (!ctx.from) {
    return;
  }

  const callbackData =
    'data' in (ctx.callbackQuery || {})
      ? (ctx.callbackQuery as { data: string }).data
      : undefined;

  if (
    !callbackData ||
    typeof callbackData !== 'string' ||
    !callbackData.startsWith('restart_')
  ) {
    return;
  }

  try {
    await handleRestartCourse(bot, ctx, callbackData);
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

  const callbackData =
    'data' in (ctx.callbackQuery || {})
      ? (ctx.callbackQuery as { data: string }).data
      : undefined;

  if (
    !callbackData ||
    typeof callbackData !== 'string' ||
    !callbackData.startsWith('start_day_1_')
  ) {
    return;
  }

  try {
    await handleStartDay1(bot, ctx, callbackData);
  } catch (error) {
    console.error('Error in startDay1Callback:', error);
    await ctx.answerCbQuery('⚠️ Помилка при надсиланні відео');
  }
}

export async function instagramVideoCallback(bot: Telegraf<Context>, ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const callbackData =
    'data' in (ctx.callbackQuery || {})
      ? (ctx.callbackQuery as { data: string }).data
      : undefined;

  if (
    !callbackData ||
    typeof callbackData !== 'string' ||
    !callbackData.startsWith('instagram_video_')
  ) {
    return;
  }

  try {
    await handleInstagramVideo(bot, ctx, callbackData);
  } catch (error) {
    console.error('Error in instagramVideoCallback:', error);
    await ctx.answerCbQuery('⚠️ Помилка при надсиланні відео');
  }
}

export async function instagramFeedbackCallback(bot: Telegraf<Context>, ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const callbackData =
    'data' in (ctx.callbackQuery || {})
      ? (ctx.callbackQuery as { data: string }).data
      : undefined;

  if (
    !callbackData ||
    typeof callbackData !== 'string' ||
    !callbackData.startsWith('instagram_feedback_')
  ) {
    return;
  }

  try {
    await handleInstagramFeedback(bot, ctx, callbackData);
  } catch (error) {
    console.error('Error in instagramFeedbackCallback:', error);
    await ctx.answerCbQuery('⚠️ Помилка при обробці відгуку');
  }
}
