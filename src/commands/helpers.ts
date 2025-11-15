import { Context } from 'telegraf';
import { QueryResult } from 'pg';
import { isAdmin } from '../services/userService';
import { AdminContextRow } from '../types';
import { db } from '../db';

export function ensureFromAndAdmin(ctx: Context): boolean {
  if (!ctx.from) {
    return false;
  }

  if (!isAdmin(ctx)) {
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

export async function getAdminCourseContext(
  telegramId: number
): Promise<AdminContextRow | null> {
  try {
    const res: QueryResult<AdminContextRow> = await db.query(
      'SELECT * FROM admin_context WHERE telegram_id = $1',
      [telegramId]
    );
    return res.rows[0] || null;
  } catch (e) {
    console.error('Error getting admin context:', e);
    return null;
  }
}
