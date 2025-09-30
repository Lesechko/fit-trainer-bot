import { Context, Telegraf } from 'telegraf';
import { db } from '../db';
import { WhitelistRow } from '../types';
import {
  ADMIN_ONLY_ADD,
  ADMIN_ONLY_LIST,
  ADDUSER_USAGE,
  ADDUSER_BAD_ID,
  ADDUSER_ERROR,
  addUserOk,
  LIST_ERROR,
  LIST_EMPTY,
  listUsers,
  GENACCESS_USAGE,
  GENACCESS_CREATED,
  GENACCESS_ERROR,
  CREATECOURSE_USAGE,
  CREATECOURSE_OK,
  CREATECOURSE_ERROR,
  COURSES_EMPTY,
  listCourses,
  SETCOURSE_USAGE,
  SETCOURSE_OK,
} from '../messages';
import { isAdmin } from '../utils';
import { ensureFromAndAdmin, getCommandParts } from './helpers';

export function addUserCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx, ADMIN_ONLY_ADD)) return;

  const parts = getCommandParts(ctx);
  if (parts.length !== 2) {
    return ctx.reply(ADDUSER_USAGE);
  }

  const newUserId = Number(parts[1]);

  if (!Number.isFinite(newUserId)) {
    return ctx.reply(ADDUSER_BAD_ID);
  }

  db.query(
    'INSERT INTO whitelist (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING',
    [newUserId]
  )
    .then(() => {
      ctx.reply(addUserOk(newUserId));
    })
    .catch((err: Error) => {
      console.error(err);
      ctx.reply(ADDUSER_ERROR);
    });
}

export function listUsersCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx, ADMIN_ONLY_LIST)) return;

  db.query('SELECT telegram_id FROM whitelist')
    .then((result: any) => {
      const rows = result.rows as WhitelistRow[];

      if (!rows || rows.length === 0) {
        return ctx.reply(LIST_EMPTY);
      }
      
      const list = rows.map((r) => String(r.telegram_id)).join('\\n');
      return ctx.reply(listUsers(list));
    })
    .catch((err: Error) => {
      console.error(err);
      ctx.reply(LIST_ERROR);
    });
}

export async function genAccessCodeCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx, ADMIN_ONLY_LIST)) return;

  const parts = getCommandParts(ctx);
  if (parts.length < 2 || parts.length > 3) {
    return ctx.reply(GENACCESS_USAGE, { parse_mode: 'HTML' });
  }

  const slug = parts[1];
  const expiresDays = parts[2] ? Number(parts[2]) : NaN;

  try {
    const courseRes: any = await db.query('SELECT id, slug FROM courses WHERE slug = $1', [slug]);
    const course = courseRes.rows[0];
    if (!course) {
      return ctx.reply(GENACCESS_ERROR);
    }

    const code = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    const expiresAt = Number.isFinite(expiresDays)
      ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
      : null;

    await db.query(
      'INSERT INTO course_access_codes (code, course_id, created_by, expires_at) VALUES ($1, $2, $3, $4)',
      [code, course.id, ctx.from!.id, expiresAt ? expiresAt.toISOString() : null]
    );

    return ctx.reply(GENACCESS_CREATED(slug, code, expiresAt ? expiresAt.toISOString().split('T')[0] : null), {
      parse_mode: 'HTML',
    });
  } catch (e) {
    console.error(e);
    return ctx.reply(GENACCESS_ERROR);
  }
}

export async function createCourseCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx, ADMIN_ONLY_LIST)) return;

  const parts = getCommandParts(ctx);
  if (parts.length < 3) {
    return ctx.reply(CREATECOURSE_USAGE);
  }

  const slug = parts[1];
  const title = parts.slice(2).join(' ');

  try {
    await db.query('INSERT INTO courses (slug, title) VALUES ($1, $2)', [slug, title]);
    return ctx.reply(CREATECOURSE_OK(slug));
  } catch (e) {
    console.error(e);
    return ctx.reply(CREATECOURSE_ERROR);
  }
}

export async function listCoursesCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx, ADMIN_ONLY_LIST)) return;

  try {
    const res: any = await db.query('SELECT slug, title, is_active FROM courses ORDER BY slug');
    const rows = res.rows as { slug: string; title: string; is_active: boolean }[];
    if (!rows || rows.length === 0) {
      return ctx.reply(COURSES_EMPTY);
    }
    const list = rows.map((r) => `${r.slug} — ${r.title}${r.is_active ? '' : ' (inactive)'}`).join('\n');
    return ctx.reply(listCourses(list));
  } catch (e) {
    console.error(e);
    return ctx.reply(COURSES_EMPTY);
  }
}

export async function setCourseContextCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx, ADMIN_ONLY_LIST)) return;

  const parts = getCommandParts(ctx);
  if (parts.length !== 2) {
    return ctx.reply(SETCOURSE_USAGE);
  }
  const slug = parts[1];

  try {
    const courseRes: any = await db.query('SELECT id FROM courses WHERE slug = $1', [slug]);
    const course = courseRes.rows[0];
    if (!course) {
      return ctx.reply(SETCOURSE_USAGE);
    }
    await db.query(
      'INSERT INTO admin_context (telegram_id, course_id, updated_at) VALUES ($1, $2, $3) ON CONFLICT (telegram_id) DO UPDATE SET course_id = EXCLUDED.course_id, updated_at = EXCLUDED.updated_at',
      [ctx.from!.id, course.id, new Date().toISOString()]
    );
    return ctx.reply(SETCOURSE_OK(slug));
  } catch (e) {
    console.error(e);
    return ctx.reply(SETCOURSE_USAGE);
  }
}



