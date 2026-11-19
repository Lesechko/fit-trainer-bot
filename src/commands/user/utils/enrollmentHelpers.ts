import { Context } from 'telegraf';
import { db } from '../../../db';
import { BOT_USERNAME } from '../../../config';
import { buildPaidStartUrl, generateAccessCode } from './accessCodeFormat';
import { CodeRow } from './enrollmentTypes';

export { parseDelayToMs } from './delayUtils';
export { buildPaidStartUrl, generateAccessCode } from './accessCodeFormat';

/**
 * Get command parameter from message text (/start <param>).
 */
export function getCommandParam(ctx: Context): string | null {
  const text =
    ctx.message && 'text' in ctx.message
      ? (ctx.message as { text: string }).text
      : undefined;
  const parts = (text || '').trim().split(/\s+/);
  return parts.length === 2 ? parts[1] : null;
}

/**
 * Get course from database by slug
 */
export async function getCourseFromDb(courseSlug: string): Promise<{ id: number; slug: string; title: string } | null> {
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
export async function createAccessCodeForPayment(courseId: number, courseSlug: string): Promise<CodeRow> {
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
 * WayForPay return URL format (configure in merchant dashboard).
 * Format: https://t.me/botname?start=paid-courseslug
 *
 * Note: This is documentation/reference only — the bot does not verify payment.
 * See docs/bot-structure-audit.md P0 payment trust.
 */
export function getPaymentRedirectUrl(courseSlug: string): string {
  if (!BOT_USERNAME) {
    throw new Error('BOT_USERNAME is not configured');
  }
  return buildPaidStartUrl(BOT_USERNAME, courseSlug);
}
