import { Context, Telegraf } from 'telegraf';
import { QueryResult } from 'pg';
import { SITE_VISITOR_COURSE_NOT_FOUND } from '../../../messages';
import { COURSES } from '../../../config';
import { db } from '../../../db';
import { ensureUserExists } from './userUtils';
import { parseDelayToMs, scheduleDelayedMessage } from './enrollmentHelpers';

/**
 * Handle users who come from Instagram funnel (via https://t.me/botname?start=instagram-funnelname)
 *
 * Link formats:
 * - Instagram funnel (free video): ?start=instagram-{slug}  — use this in Instagram ads
 * - Payment redirect (after pay):  ?start=paid-{slug}      — set in WayForPay, do not use in Instagram
 */
export async function handleInstagramFunnel(
  bot: Telegraf<Context>,
  ctx: Context,
  funnelName: string
): Promise<void> {
  try {
    if (!ctx.from) {
      return;
    }

    const telegramId = ctx.from.id;

    // Check if user already went through Instagram funnel
    // If they already have entry_source='instagram', don't send anything
    const existingUserRes: QueryResult<{ id: number; entry_source: string | null }> = await db.query(
      'SELECT id, entry_source FROM users WHERE telegram_id = $1',
      [telegramId]
    );

    if (existingUserRes.rows.length > 0) {
      const existingUser = existingUserRes.rows[0];
      // If user already exists with entry_source='instagram', they already received the funnel
      if (existingUser.entry_source === 'instagram') {
        // User already went through funnel, don't send anything
        return;
      }
      // User exists but from different source, update their info but don't change entry_source
      // (entry_source is only set on first creation)
    }

    // Ensure user exists with entry_source='instagram' (only set if new user)
    const userId = await ensureUserExists(ctx, 'instagram');
    if (!userId) {
      return;
    }

    // Find course with matching Instagram funnel name
    // For simplicity, using slug as funnel name
    const courseConfig = COURSES.find(
      (c) => c.instagramFunnel && c.slug === funnelName
    );

    if (!courseConfig || !courseConfig.instagramFunnel) {
      await ctx.reply(SITE_VISITOR_COURSE_NOT_FOUND);
      return;
    }

    const { initialMessage, initialButton, videoId, followUpMessages } =
      courseConfig.instagramFunnel;

    // Send initial message with optional button
    let replyMarkup: { inline_keyboard: any[][] } | undefined = undefined;
    if (initialButton) {
      const button: any = { text: initialButton.text };
      if (initialButton.url) {
        button.url = initialButton.url;
      } else {
        // Set callback_data dynamically if not provided or if button should trigger video
        // Format: instagram_video_{slug}
        button.callback_data = `instagram_video_${courseConfig.slug}`;
      }
      replyMarkup = {
        inline_keyboard: [[button]],
      };
    }

    await ctx.reply(initialMessage, {
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });

    // Video will be sent when button is clicked (via callback handler)

    // Schedule follow-up messages
    if (followUpMessages && followUpMessages.length > 0) {
      for (const followUp of followUpMessages) {
        const delayMs = parseDelayToMs(followUp.delay);
        if (delayMs === null) {
          console.error(`Invalid delay format: ${followUp.delay}`);
          continue;
        }

        scheduleDelayedMessage(
          bot,
          telegramId,
          followUp.text,
          delayMs,
          followUp.button
        );
      }
    }
  } catch (e) {
    console.error('Error in handleInstagramFunnel:', e);
    await ctx.reply('⚠️ Помилка при обробці запиту');
  }
}
