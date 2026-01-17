import { Context, Telegraf } from 'telegraf';
import { SITE_VISITOR_COURSE_NOT_FOUND, PAYMENT_COMPLETION_ERROR } from '../../../messages';
import { getEnrollmentStartDateForCourse } from '../../../services/courseService';
import { COURSES } from '../../../config';
import { ensureUserExists } from './userUtils';
import { handleExistingEnrollment, enrollUserInCourse } from './enrollmentUtils';
import { sendEnrollmentConfirmation } from './enrollmentNotifications';
import { getCourseFromDb, createAccessCodeForPayment, createTempCodeRow } from './enrollmentHelpers';

/**
 * Handle users who return from payment service (via https://t.me/botname?start=paid-courseslug)
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
    // Update entry_source if user came from Instagram (they're now a paying customer)
    await enrollUserInCourse(userId, codeRow, startDate, 'paid');
    await sendEnrollmentConfirmation(bot, ctx, codeRow, startDate);
  } catch (e) {
    console.error('Error in handlePaymentCompletion:', e);
    await ctx.reply(PAYMENT_COMPLETION_ERROR);
  }
}
