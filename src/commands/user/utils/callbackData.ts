import { Context } from 'telegraf';

/**
 * Read callback_data from a Telegram callback query, if present.
 */
export function getCallbackData(ctx: Context): string | undefined {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !('data' in callbackQuery)) {
    return undefined;
  }
  const data = callbackQuery.data;
  return typeof data === 'string' ? data : undefined;
}
