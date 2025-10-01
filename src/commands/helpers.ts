import { Context } from 'telegraf';
import { isAdmin } from '../utils';
import { VideoRow, AdminContextRow } from '../types';
import { db } from '../db';

export function ensureFromAndAdmin(ctx: Context, notAdminMsg: string): boolean {
  if (!ctx.from) {
    return false;
  }

  if (!isAdmin(ctx)) {
    // Don't reply to non-admin users - they shouldn't know about admin commands
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

export async function getAdminCourseContext(telegramId: number): Promise<AdminContextRow | null> {
  try {
    const res = await db.query('SELECT * FROM admin_context WHERE telegram_id = $1', [telegramId]);
    return res.rows[0] || null;
  } catch (e) {
    console.error('Error getting admin context:', e);
    return null;
  }
}
