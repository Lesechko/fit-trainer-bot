import { Context, Telegraf } from 'telegraf';
import { db } from '../db';
import {
  USER_SAVE_ERROR,
  dayCaption,
  REDEEM_USAGE,
  REDEEM_INVALID,
  REDEEM_USED,
  REDEEM_OK,
  START_ASK_CODE,
} from '../messages';
import { COURSES } from '../config';
import { getCommandParts } from './helpers';
import { calculateProgramDay } from '../utils';

export function startCommandCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const telegramId = ctx.from.id;
  const startDate = new Date().toISOString().split('T')[0];

  db.query(
    'INSERT INTO users (telegram_id, start_date) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING',
    [telegramId, startDate]
  )
    .then(async () => {
      const text = (ctx.message as any)?.text as string | undefined;
      const parts = (text || '').trim().split(/\s+/);
      // Support deep-link: /start <code>
      if (parts.length === 2) {
        await redeemWithCode(ctx, parts[1]);
        return;
      }
      ctx.reply(START_ASK_CODE);
    })
    .catch((err: Error) => {
      console.error(err.message);
      ctx.reply(USER_SAVE_ERROR);
    });
}

export function dayCommandCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const telegramId = ctx.from.id;

  // Get user's start date
  db.query('SELECT start_date FROM users WHERE telegram_id = $1', [telegramId])
    .then((result: any) => {
      const row = result.rows[0];
      if (row?.start_date) {
        const day = calculateProgramDay(row.start_date);

        // Get video for this day
        return db
          .query('SELECT file_id FROM videos WHERE day = $1', [day])
          .then((videoResult: any) => {
            const videoRow = videoResult.rows[0];

            if (videoRow?.file_id) {
              ctx.replyWithVideo(videoRow.file_id, {
                caption: dayCaption(day),
              });
            }
          });
      }
    })
    .catch((err: Error) => {
      console.error('Error fetching user:', err);
    });
}

async function redeemWithCode(ctx: Context, code: string) {
  const telegramId = ctx.from!.id;
  try {
    // Ensure user exists and fetch internal user id
    const userRes: any = await db.query(
      'INSERT INTO users (telegram_id, start_date) VALUES ($1, $2) ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id RETURNING id',
      [telegramId, new Date().toISOString().split('T')[0]]
    );
    const userId: number = userRes.rows[0].id;

    // Load code
    const codeRes: any = await db.query(
      'SELECT cac.id, cac.code, cac.course_id, cac.expires_at, cac.is_used, c.slug FROM course_access_codes cac JOIN courses c ON c.id = cac.course_id WHERE cac.code = $1',
      [code]
    );
    const row = codeRes.rows[0];
    if (!row) {
      return ctx.reply(REDEEM_INVALID);
    }
    if (row.is_used) {
      return ctx.reply(REDEEM_USED);
    }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return ctx.reply(REDEEM_INVALID);
    }

    // Enroll user
    const startDate = new Date().toISOString().split('T')[0];
    await db.query(
      'INSERT INTO user_courses (user_id, course_id, start_date) VALUES ($1, $2, $3) ON CONFLICT (user_id, course_id) DO NOTHING',
      [userId, row.course_id, startDate]
    );

    // Mark code used
    await db.query(
      'UPDATE course_access_codes SET is_used = TRUE, used_by = $1, used_at = $2 WHERE id = $3',
      [userId, new Date().toISOString(), row.id]
    );

    const course = COURSES.find((c) => c.slug === row.slug);
    if (course?.welcome) {
      await ctx.reply(course.welcome);
    }
    return ctx.reply(REDEEM_OK(row.slug));
  } catch (e) {
    console.error(e);
    return ctx.reply(REDEEM_INVALID);
  }
}

export async function redeemCommandCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const text = (ctx.message as any)?.text as string | undefined;
  const parts = (text || '').trim().split(/\s+/);
  if (parts.length !== 2) {
    return ctx.reply(REDEEM_USAGE);
  }
  const code = parts[1];
  return redeemWithCode(ctx, code);
}
