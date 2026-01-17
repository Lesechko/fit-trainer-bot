import { Context, Telegraf } from 'telegraf';
import { SITE_VISITOR_COURSE_NOT_FOUND, PAYMENT_COMPLETION_ERROR } from '../../../messages';
import { getEnrollmentStartDateForCourse } from '../../../services/courseService';
import { COURSES } from '../../../config';
import { ensureUserExists } from './userUtils';
import { handleExistingEnrollment, enrollUserInCourse } from './enrollmentUtils';
import { sendEnrollmentConfirmation } from './enrollmentNotifications';
import { getCourseFromDb, createAccessCodeForPayment } from './enrollmentHelpers';

/**
 * Handle users who return from payment service (via https://t.me/botname?start=paid-courseslug)
 * Note: For the free Instagram funnel use ?start=instagram-{slug}, not paid-{slug}.
 * paid-{slug} is only for the WayForPay redirect after payment.
 */
export async function handlePaymentCompletion(
  bot: Telegraf<Context>,
  ctx: Context,
  courseSlug: string
): Promise<void> {
  try {
    // Ensure user exists with entry_source='paid'
    const userId = await ensureUserExists(ctx, 'paid');
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

    // Create access code before handleExistingEnrollment so the "Почати курс заново"
    // button can use a real code when user has in-progress enrollment (empty code
    // would break the callback and redeemWithCode).
    const codeRow = await createAccessCodeForPayment(course.id, courseSlug);

    // Handle existing enrollment - same logic as code redemption
    // - Completed course: cleanup and allow new enrollment
    // - In-progress course: show restart dialog (button uses codeRow.code above)
    const shouldContinue = await handleExistingEnrollment(ctx, userId, codeRow);
    if (!shouldContinue) {
      return;
    }

    const startDate = getEnrollmentStartDateForCourse(courseSlug);
    // Update entry_source if user came from Instagram (they're now a paying customer)
    await enrollUserInCourse(userId, codeRow, startDate, 'paid');
    await sendEnrollmentConfirmation(bot, ctx, codeRow, startDate);
  } catch (e) {
    console.error('Error in handlePaymentCompletion:', e);
    await ctx.reply(PAYMENT_COMPLETION_ERROR);
  }
}
