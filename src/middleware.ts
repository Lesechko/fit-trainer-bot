import { Context } from 'telegraf';
import { ADMIN_ID } from './config';
import { db, WhitelistRow } from './db';
import { ACCESS_DENIED, ACCESS_ERROR } from './messages';

export async function whitelistGuard(ctx: Context, next: () => Promise<void>) {
  if (!ctx.from) {
    return;
  }

  const telegramId = ctx.from.id;

  if (ADMIN_ID && telegramId === ADMIN_ID) {
    return next();
  }

  try {
    const result: any = await db.query(
      'SELECT telegram_id FROM whitelist WHERE telegram_id = $1',
      [telegramId]
    );

    const row = result.rows[0] as WhitelistRow | undefined;

    if (row) {
      return next();
    }

    return ctx.reply(ACCESS_DENIED);
  } catch (err) {
    console.error(err);
    return ctx.reply(ACCESS_ERROR);
  }
}
