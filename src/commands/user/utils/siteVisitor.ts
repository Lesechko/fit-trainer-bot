import { Context } from 'telegraf';
import { SITE_VISITOR_COURSE_NOT_FOUND } from '../../../messages';
import { COURSES } from '../../../config';
import { ensureUserExists } from './userUtils';

/**
 * Handle users who come from the website (via https://t.me/botname?start=site-courseslug)
 */
export async function handleSiteUser(ctx: Context, courseSlug: string): Promise<void> {
  // Ensure user exists with entry_source='site'
  await ensureUserExists(ctx, 'site');

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
