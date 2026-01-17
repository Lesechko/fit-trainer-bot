import { Context } from 'telegraf';
import { db } from '../../db';
import {
  COURSES_EMPTY,
  listCourses,
  listCourseSlugs,
  SETCOURSE_USAGE,
  SETCOURSE_OK,
  SYNC_COURSES_START,
  SYNC_COURSES_DONE,
  SYNC_COURSES_ERROR,
  CONTEXT_NOT_SET,
  CONTEXT_CURRENT,
} from '../../messages';
import { getCommandParts, getAdminCourseContext } from '../helpers';
import { COURSES } from '../../config';

export async function listCoursesCommandCallback(ctx: Context) {
  try {
    const res: any = await db.query(
      'SELECT slug, title, is_active FROM courses ORDER BY slug'
    );
    const rows = res.rows as {
      slug: string;
      title: string;
      is_active: boolean;
    }[];

    if (!rows || rows.length === 0) {
      return ctx.reply(COURSES_EMPTY);
    }

    const list = rows
      .map((r) => `${r.slug} — ${r.title}${r.is_active ? '' : ' (inactive)'}`)
      .join('\n');
    const slugList = rows.map((r) => r.slug).join('\n');
    await ctx.reply(listCourses(list));

    return ctx.reply(listCourseSlugs(slugList));
  } catch (e) {
    console.error(e);
    return ctx.reply(COURSES_EMPTY);
  }
}

export async function setCourseContextCommandCallback(ctx: Context) {
  const parts = getCommandParts(ctx);

  if (parts.length !== 2) {
    return ctx.reply(SETCOURSE_USAGE);
  }

  const slug = parts[1];

  try {
    const courseRes: any = await db.query(
      'SELECT id FROM courses WHERE slug = $1',
      [slug]
    );
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

export async function syncCoursesFromConfigCommandCallback(ctx: Context) {
  try {
    await ctx.reply(SYNC_COURSES_START);
    for (const c of COURSES) {
      await db.query(
        'INSERT INTO courses (slug, title, is_active) VALUES ($1, $2, TRUE) ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, is_active = TRUE',
        [c.slug, c.title]
      );
    }

    return ctx.reply(SYNC_COURSES_DONE);
  } catch (e) {
    console.error(e);
    return ctx.reply(SYNC_COURSES_ERROR);
  }
}

export async function contextCommandCallback(ctx: Context) {
  try {
    const res: any = await db.query(
      'SELECT c.slug, c.title FROM admin_context ac JOIN courses c ON c.id = ac.course_id WHERE ac.telegram_id = $1',
      [ctx.from!.id]
    );
    const row = res.rows[0] as { slug: string; title: string } | undefined;

    if (!row) {
      return ctx.reply(CONTEXT_NOT_SET);
    }

    return ctx.reply(CONTEXT_CURRENT(row.slug, row.title));
  } catch (e) {
    console.error(e);
    return ctx.reply(CONTEXT_NOT_SET);
  }
}
