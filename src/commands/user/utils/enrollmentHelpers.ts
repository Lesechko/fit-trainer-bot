import { Context } from 'telegraf';
import { db } from '../../../db';
import { BOT_USERNAME } from '../../../config';
import { generateAccessCode } from './codeUtils';
import { CodeRow } from './enrollmentTypes';

/**
 * Extract course slug from parameter with prefix
 * Returns null if prefix doesn't match or slug is empty
 */
export function extractCourseSlug(param: string, prefix: string): string | null {
  if (!param.startsWith(prefix)) {
    return null;
  }
  const courseSlug = param.substring(prefix.length);
  return courseSlug || null;
}

/**
 * Get command parameter from message text
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

/**
 * Parse time delay string to milliseconds
 * Supports: "20min", "2h", "1d", "30min", "3h", "2d", etc.
 */
export function parseDelayToMs(delay: string): number | null {
  const normalized = delay.trim().toLowerCase();
  
  // Match number and unit
  const match = normalized.match(/^(\d+)(min|h|d)$/);
  if (!match) {
    return null;
  }
  
  const value = Number(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 'min':
      return value * 60 * 1000; // minutes to milliseconds
    case 'h':
      return value * 60 * 60 * 1000; // hours to milliseconds
    case 'd':
      return value * 24 * 60 * 60 * 1000; // days to milliseconds
    default:
      return null;
  }
}

/**
 * Schedule a delayed message to be sent
 */
export function scheduleDelayedMessage(
  bot: any, // Telegraf<Context>
  telegramId: number,
  text: string,
  delayMs: number,
  buttons?: Array<{ text: string; url?: string; callback_data?: string }>
): void {
  setTimeout(async () => {
    try {
      let replyMarkup: { inline_keyboard: any[][] } | undefined = undefined;
      
      if (buttons && buttons.length > 0) {
        const keyboardButtons: any[] = [];

        for (const btn of buttons) {
          const keyboardBtn: any = { text: btn.text };

          if (btn.url) {
            keyboardBtn.url = btn.url;
          } else if (btn.callback_data) {
            keyboardBtn.callback_data = btn.callback_data;
          }
          keyboardButtons.push(keyboardBtn);
        }
        // Each button on its own row for better readability with long text
        replyMarkup = {
          inline_keyboard: keyboardButtons.map(btn => [btn]),
        };
      }

      await bot.telegram.sendMessage(telegramId, text, {
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    } catch (error) {
      console.error(`Error sending delayed message to ${telegramId}:`, error);
    }
  }, delayMs);
}
