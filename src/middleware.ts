import { Context } from 'telegraf';
import { ADMIN_ID } from './config';

export async function whitelistGuard(ctx: Context, next: () => Promise<void>) {
  if (!ctx.from) {
    return;
  }

  const telegramId = ctx.from.id;

  // Only admin can access the bot now (no whitelist system)
  if (ADMIN_ID && telegramId === ADMIN_ID) {
    return next();
  }

  // For non-admin users, we allow access to user commands but not admin commands
  // Admin commands are protected by ensureFromAndAdmin in command handlers
  return next();
}
