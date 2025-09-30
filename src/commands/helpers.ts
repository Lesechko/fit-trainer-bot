import { Context } from 'telegraf';
import { isAdmin } from '../utils';
import { VideoRow } from '../types';

export function ensureFromAndAdmin(ctx: Context, notAdminMsg: string): boolean {
  if (!ctx.from) {
    return false;
  }

  if (!isAdmin(ctx)) {
    ctx.reply(notAdminMsg);
    return false;
  }

  return true;
}

export function getCommandParts(ctx: Context): string[] {
  const text = (ctx.message as any)?.text as string | undefined;

  return (text || '').trim().split(/\s+/);
}

export function isValidDay(num: number): boolean {
  return Number.isFinite(num) && num >= 1 && num <= 10;
}

export function formatVideosList(rows: VideoRow[]): string {
  return rows
    .map((r) => `День ${r.day}: ${r.file_id.substring(0, 20)}...`)
    .join('\n');
}
