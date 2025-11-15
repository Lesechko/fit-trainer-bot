import { Context, Telegraf } from 'telegraf';
import { db } from '../db';
import {
  GENACCESS_USAGE,
  GENACCESS_CREATED,
  GENACCESS_ERROR,
  GENACCESS_CODE,
  GENACCESS_LINK,
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
  USERS_ERROR,
  USERS_EMPTY,
  usersList,
  REMOVEUSER_USAGE,
  REMOVEUSER_ERROR,
  REMOVEUSER_SUCCESS,
  REMOVEUSER_NOT_FOUND,
  SENDDAY_USAGE,
  SENDDAY_ERROR,
  SENDDAY_SUCCESS,
  SENDDAY_USER_NOT_FOUND,
  SENDDAY_INVALID_DAY,
  SENDDAY_VIDEO_NOT_FOUND,
} from '../messages';
import {
  ensureFromAndAdmin,
  getCommandParts,
  getAdminCourseContext,
} from './helpers';
import { COURSES } from '../config';
import { formatUserDisplayName } from '../services/userHelpers';
import { calculateUserProgress } from '../services/courseService';
import { sendDayVideoToUser } from '../services/videoService';

export async function listUsersCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx)) return;

  try {
    const adminContext = await getAdminCourseContext(ctx.from!.id);

    if (!adminContext?.course_id) {
      return ctx.reply('⚠️ Спочатку встанови курс командою /setcourse <slug>');
    }

    const res: any = await db.query(
      `
      SELECT 
        u.telegram_id, 
        u.username,
        u.first_name,
        u.last_name,
        u.language_code,
        uc.start_date, 
        uc.created_at as enrolled_at,
        c.title as course_title,
        c.slug as course_slug
      FROM users u 
      JOIN user_courses uc ON u.id = uc.user_id 
      JOIN courses c ON c.id = uc.course_id
      WHERE uc.course_id = $1
      ORDER BY uc.created_at DESC
    `,
      [adminContext.course_id]
    );

    const users = res.rows as {
      telegram_id: number;
      username: string | null;
      first_name: string | null;
      last_name: string | null;
      language_code: string | null;
      start_date: string;
      enrolled_at: string;
      course_title: string;
      course_slug: string;
    }[];

    if (users.length === 0) {
      return ctx.reply(USERS_EMPTY);
    }

    // Get course config for days count
    const courseConfig = COURSES.find((c) => c.slug === users[0]?.course_slug);
    if (!courseConfig) {
      return ctx.reply('⚠️ Конфігурація курсу не знайдена');
    }

    // Format users list
    const list = users
      .map((u) => {
        const { status } = calculateUserProgress(u.start_date, courseConfig);
        const displayName = formatUserDisplayName(u);

        return `👤 ${displayName} (${u.telegram_id}) | ${status} | Почав: ${u.start_date}`;
      })
      .join('\n');

    return ctx.reply(usersList(list));
  } catch (e) {
    console.error(e);
    return ctx.reply(USERS_ERROR);
  }
}

export async function genAccessCodeCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx)) return;

  const parts = getCommandParts(ctx);
  if (parts.length > 2) {
    return ctx.reply(GENACCESS_USAGE);
  }

  const expiresDays = parts[1] ? Number(parts[1]) : NaN;

  try {
    const contextRes: any = await db.query(
      'SELECT c.id, c.slug FROM admin_context ac JOIN courses c ON c.id = ac.course_id WHERE ac.telegram_id = $1',
      [ctx.from!.id]
    );

    const course = contextRes.rows[0];

    if (!course) {
      return ctx.reply('⚠️ Спочатку встанови курс командою /setcourse <slug>');
    }

    const code =
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 6);

    const expiresAt = Number.isFinite(expiresDays)
      ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
      : null;

    await db.query(
      'INSERT INTO course_access_codes (code, course_id, expires_at) VALUES ($1, $2, $3)',
      [
        code,
        course.id,
        expiresAt ? expiresAt.toISOString() : null,
      ]
    );

    await ctx.reply(
      GENACCESS_CREATED(
        course.slug,
        code,
        expiresAt ? expiresAt.toISOString().split('T')[0] : null
      )
    );
    await ctx.reply(GENACCESS_CODE(code));

    if (process.env.BOT_USERNAME) {
      const link = `https://t.me/${process.env.BOT_USERNAME}?start=${code}`;

      return ctx.reply(GENACCESS_LINK(link));
    }
    return;
  } catch (e) {
    console.error(e);
    return ctx.reply(GENACCESS_ERROR);
  }
}

export async function listCoursesCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx)) return;

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
  if (!ensureFromAndAdmin(ctx)) return;

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
  if (!ensureFromAndAdmin(ctx)) return;

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
  if (!ensureFromAndAdmin(ctx)) return;

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

export async function removeUserCommandCallback(ctx: Context) {
  if (!ensureFromAndAdmin(ctx)) return;

  const parts = getCommandParts(ctx);
  if (parts.length !== 2) {
    return ctx.reply(REMOVEUSER_USAGE);
  }

  const telegramId = Number(parts[1]);
  if (!Number.isFinite(telegramId)) {
    return ctx.reply(REMOVEUSER_USAGE);
  }

  try {
    const adminContext = await getAdminCourseContext(ctx.from!.id);

    if (!adminContext?.course_id) {
      return ctx.reply('⚠️ Спочатку встанови курс командою /setcourse <slug>');
    }

    // Check if user exists in the current course
    const userRes: any = await db.query(
      `
      SELECT u.id, u.telegram_id, c.title as course_title
      FROM users u 
      JOIN user_courses uc ON u.id = uc.user_id 
      JOIN courses c ON c.id = uc.course_id
      WHERE u.telegram_id = $1 AND uc.course_id = $2
    `,
      [telegramId, adminContext.course_id]
    );

    const user = userRes.rows[0];
    if (!user) {
      return ctx.reply(REMOVEUSER_NOT_FOUND(telegramId));
    }

    // Remove user from course
    await db.query(
      'DELETE FROM user_courses WHERE user_id = $1 AND course_id = $2',
      [user.id, adminContext.course_id]
    );

    return ctx.reply(REMOVEUSER_SUCCESS(telegramId, user.course_title));
  } catch (e) {
    console.error(e);
    return ctx.reply(REMOVEUSER_ERROR);
  }
}

export function sendDayToUserCommandCallback(bot: Telegraf<Context>) {
  return async (ctx: Context) => {
    if (!ensureFromAndAdmin(ctx)) return;

    const parts = getCommandParts(ctx);
    if (parts.length !== 3) {
      return ctx.reply(SENDDAY_USAGE);
    }

    const telegramId = parseInt(parts[1]);
    const day = parseInt(parts[2]);

    if (!Number.isFinite(telegramId) || !Number.isFinite(day)) {
      return ctx.reply(SENDDAY_USAGE);
    }

    if (day < 1) {
      return ctx.reply(SENDDAY_INVALID_DAY);
    }

    try {
      const adminContext = await getAdminCourseContext(ctx.from!.id);

      if (!adminContext?.course_id) {
        return ctx.reply(CONTEXT_NOT_SET);
      }

      // Verify user is enrolled in this course
      const userRes: any = await db.query(
        `
        SELECT u.telegram_id, c.slug, c.id as course_id
        FROM users u
        JOIN user_courses uc ON u.id = uc.user_id
        JOIN courses c ON c.id = uc.course_id
        WHERE u.telegram_id = $1 AND uc.course_id = $2
      `,
        [telegramId, adminContext.course_id]
      );

      if (userRes.rows.length === 0) {
        return ctx.reply(SENDDAY_USER_NOT_FOUND(telegramId));
      }

      const courseSlug = userRes.rows[0].slug;
      const courseId = userRes.rows[0].course_id;

      // Check if video exists for this day
      const videoRes: any = await db.query(
        'SELECT day FROM course_videos WHERE course_id = $1 AND day = $2',
        [courseId, day]
      );

      if (videoRes.rows.length === 0) {
        return ctx.reply(SENDDAY_VIDEO_NOT_FOUND(day));
      }

      // Send the video
      await sendDayVideoToUser(bot, telegramId, courseId, courseSlug, day);

      return ctx.reply(SENDDAY_SUCCESS(telegramId, day));
    } catch (e) {
      console.error(e);
      return ctx.reply(SENDDAY_ERROR);
    }
  };
}
