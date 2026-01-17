import { Context, Telegraf } from 'telegraf';
import { REDEEM_USAGE, REDEEM_INVALID, START_ASK_CODE, SITE_VISITOR_COURSE_NOT_FOUND, PAYMENT_COMPLETION_ERROR, PAYMENT_ALREADY_ENROLLED } from '../../messages';
import { getEnrollmentStartDateForCourse } from '../../services/courseService';
import { ensureUserExists } from './utils/userUtils';
import {
  handleExistingEnrollment,
  enrollUserInCourse,
} from './utils/enrollmentUtils';
import { validateAndLoadCode, processUsedCode, generateAccessCode } from './utils/codeUtils';
import { sendEnrollmentConfirmation } from './utils/enrollmentNotifications';
import { handleRestartCourse, handleStartDay1 } from './utils/callbackUtils';
import { COURSES, BOT_USERNAME } from '../../config';
import { db } from '../../db';
import { CodeRow } from './utils/enrollmentTypes';

/**
 * Extract course slug from parameter with prefix
 * Returns null if prefix doesn't match or slug is empty
 */
function extractCourseSlug(param: string, prefix: string): string | null {
  if (!param.startsWith(prefix)) {
    return null;
  }
  const courseSlug = param.substring(prefix.length);
  return courseSlug || null;
}

/**
 * Get command parameter from message text
 */
function getCommandParam(ctx: Context): string | null {
  const text =
    ctx.message && 'text' in ctx.message
      ? (ctx.message as { text: string }).text
      : undefined;
  const parts = (text || '').trim().split(/\s+/);
  return parts.length === 2 ? parts[1] : null;
}

export function startCommandCallback(bot: Telegraf<Context>) {
  return (ctx: Context) => {
    if (!ctx.from) {
      return;
    }

    const param = getCommandParam(ctx);
    if (!param) {
      void ctx.reply(START_ASK_CODE);
      return;
    }

    // Check if user came from payment redirect (format: paid-courseslug)
    const paidSlug = extractCourseSlug(param, 'paid-');
    if (paidSlug) {
      return handlePaymentCompletion(bot, ctx, paidSlug);
    }

    // Check if user came from website (format: site-courseslug)
    const siteSlug = extractCourseSlug(param, 'site-');
    if (siteSlug) {
      return handleSiteUser(ctx, siteSlug);
    }

    // Otherwise, treat as access code
    return redeemWithCode(bot, ctx, param);
  };
}

/**
 * Generate payment redirect URL format for reference
 * This is the URL format that should be configured in WayForPay service settings
 * Format: https://t.me/botname?start=paid-courseslug
 * 
 * Note: The redirect URL is configured directly in WayForPay dashboard,
 * not passed as a parameter in the payment URL
 */
export function getPaymentRedirectUrl(courseSlug: string): string {
  if (!BOT_USERNAME) {
    throw new Error('BOT_USERNAME is not configured');
  }
  return `https://t.me/${BOT_USERNAME}?start=paid-${courseSlug}`;
}

// Handle users who come from the website (via https://t.me/botname?start=site-courseslug)
async function handleSiteUser(ctx: Context, courseSlug: string) {
  const courseConfig = COURSES.find((c) => c.slug === courseSlug);

  if (!courseConfig || !courseConfig.siteVisitor) {
    await ctx.reply(SITE_VISITOR_COURSE_NOT_FOUND);
    return;
  }

  const { greeting, paymentUrl, paymentButtonText } = courseConfig.siteVisitor;

  // Check if payment URL is configured
  if (!paymentUrl) {
    console.error(`PAYMENT_URL not configured for course: ${courseSlug}`);
    await ctx.reply(greeting, { parse_mode: 'HTML' });
    return;
  }

  // Send greeting with payment button
  // Note: Redirect URL is configured directly in WayForPay service settings
  await ctx.reply(greeting, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: paymentButtonText || '💳 Оплатити курс',
            url: paymentUrl,
          },
        ],
      ],
    },
  });
}

/**
 * Get course from database by slug
 */
async function getCourseFromDb(courseSlug: string): Promise<{ id: number; slug: string; title: string } | null> {
  const courseRes = await db.query(
    'SELECT id, slug, title FROM courses WHERE slug = $1',
    [courseSlug]
  );
  if (courseRes.rows.length === 0) {
    return null;
  }
  const course = courseRes.rows[0];
  return {
    id: Number(course.id),
    slug: String(course.slug),
    title: String(course.title),
  };
}

/**
 * Create access code in database and return CodeRow
 */
async function createAccessCodeForPayment(courseId: number, courseSlug: string): Promise<CodeRow> {
  const code = generateAccessCode();
  const codeInsertRes = await db.query(
    'INSERT INTO course_access_codes (code, course_id, expires_at) VALUES ($1, $2, $3) RETURNING id',
    [code, courseId, null] // No expiration for payment-based codes
  );
  const codeId = Number(codeInsertRes.rows[0].id);

  return {
    id: codeId,
    code,
    course_id: courseId,
    expires_at: null,
    is_used: false,
    slug: courseSlug,
  };
}

/**
 * Create temporary code row for enrollment check
 */
function createTempCodeRow(courseId: number, courseSlug: string): CodeRow {
  return {
    id: 0,
    code: '',
    course_id: courseId,
    expires_at: null,
    is_used: false,
    slug: courseSlug,
  };
}

// Handle users who return from payment service (via https://t.me/botname?start=paid-courseslug)
async function handlePaymentCompletion(bot: Telegraf<Context>, ctx: Context, courseSlug: string) {
  try {
    // Ensure user exists
    const userId = await ensureUserExists(ctx);
    if (!userId) {
      await ctx.reply(PAYMENT_COMPLETION_ERROR);
      return;
    }

    // Validate course exists in config
    const courseConfig = COURSES.find((c) => c.slug === courseSlug);
    if (!courseConfig) {
      await ctx.reply(SITE_VISITOR_COURSE_NOT_FOUND);
      return;
    }

    // Get course from database
    const course = await getCourseFromDb(courseSlug);
    if (!course) {
      await ctx.reply(SITE_VISITOR_COURSE_NOT_FOUND);
      return;
    }

    // Create temporary code row for enrollment check (will be replaced with real code later)
    const tempCodeRow = createTempCodeRow(course.id, courseSlug);

    // Handle existing enrollment - same logic as code redemption
    // This checks if user is enrolled in any course and handles:
    // - Completed course: cleanup and allow new enrollment
    // - In-progress course: show restart dialog
    const shouldContinue = await handleExistingEnrollment(ctx, userId, tempCodeRow);
    if (!shouldContinue) {
      return;
    }

    // Create access code and enroll user
    const codeRow = await createAccessCodeForPayment(course.id, courseSlug);
    const startDate = getEnrollmentStartDateForCourse(courseSlug);
    await enrollUserInCourse(userId, codeRow, startDate);
    await sendEnrollmentConfirmation(bot, ctx, codeRow, startDate);
  } catch (e) {
    console.error('Error in handlePaymentCompletion:', e);
    await ctx.reply(PAYMENT_COMPLETION_ERROR);
  }
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
    await enrollUserInCourse(userId, codeRow, startDate);
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
