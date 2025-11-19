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
  getCommandParts,
  getAdminCourseContext,
} from './helpers';
import { COURSES } from '../config';
import { formatUserDisplayName } from '../services/userHelpers';
import { calculateUserProgress, getDayConfig } from '../services/courseService';
import {
  sendDayVideoToUser,
  sendDifficultyChoiceMessage,
} from '../services/videoService';

const USERS_PER_PAGE = 20;

interface UserRow {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  start_date: string;
  enrolled_at: string;
  course_title: string;
  course_slug: string;
}

async function renderUsersList(
  courseId: number,
  page: number = 1,
  searchTerm?: string
): Promise<{
  message: string;
  totalPages: number;
  totalUsers: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}> {
  const offset = (page - 1) * USERS_PER_PAGE;
  
  // Build search condition
  const searchCondition = searchTerm
    ? `AND (
      u.telegram_id::text ILIKE $2 OR
      u.username ILIKE $2 OR
      u.first_name ILIKE $2 OR
      u.last_name ILIKE $2 OR
      CONCAT(u.first_name, ' ', u.last_name) ILIKE $2
    )`
    : '';
  
  const searchParam = searchTerm ? `%${searchTerm}%` : null;
  
  // Get total count
  const countQuery = searchTerm
    ? `
      SELECT COUNT(*) as total
      FROM users u 
      JOIN user_courses uc ON u.id = uc.user_id 
      WHERE uc.course_id = $1 ${searchCondition}
    `
    : `
      SELECT COUNT(*) as total
      FROM users u 
      JOIN user_courses uc ON u.id = uc.user_id 
      WHERE uc.course_id = $1
    `;
  
  const countParams = searchTerm ? [courseId, searchParam] : [courseId];
  const countRes: any = await db.query(countQuery, countParams);
  const totalUsers = parseInt(countRes.rows[0].total, 10);
  const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE));
  
  // Clamp page number
  const validPage = Math.max(1, Math.min(page, totalPages));
  
  if (totalUsers === 0) {
    return {
      message: USERS_EMPTY,
      totalPages: 0,
      totalUsers: 0,
      hasNextPage: false,
      hasPrevPage: false,
    };
  }
  
  // Get users for current page
  const usersQuery = searchTerm
    ? `
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
      WHERE uc.course_id = $1 ${searchCondition}
      ORDER BY uc.created_at DESC
      LIMIT $3 OFFSET $4
    `
    : `
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
      LIMIT $2 OFFSET $3
    `;
  
  const usersParams = searchTerm
    ? [courseId, searchParam, USERS_PER_PAGE, offset]
    : [courseId, USERS_PER_PAGE, offset];
  
  const usersRes: any = await db.query(usersQuery, usersParams);
  const users = usersRes.rows as UserRow[];
  
  // Get course config for days count
  const courseConfig = COURSES.find((c) => c.slug === users[0]?.course_slug);
  if (!courseConfig) {
    throw new Error('Course config not found');
  }
  
  // Format users list
  const list = users
    .map((u) => {
      const { status } = calculateUserProgress(u.start_date, courseConfig);
      const displayName = formatUserDisplayName(u);
      return `👤 ${displayName} (${u.telegram_id}) | ${status} | Почав: ${u.start_date}`;
    })
    .join('\n');
  
  const message = usersList(list, validPage, totalPages, totalUsers, searchTerm);
  
  return {
    message,
    totalPages,
    totalUsers,
    hasNextPage: validPage < totalPages,
    hasPrevPage: validPage > 1,
  };
}

export async function listUsersCommandCallback(ctx: Context) {
  try {
    const adminContext = await getAdminCourseContext(ctx.from!.id);

    if (!adminContext?.course_id) {
      return ctx.reply('⚠️ Спочатку встанови курс командою /setcourse <slug>');
    }

    const parts = getCommandParts(ctx);
    let page = 1;
    let searchTerm: string | undefined;

    // Parse command arguments
    // Format: /listusers [search <term>] | [page <num>]
    if (parts.length > 1) {
      if (parts[1] === 'search' && parts.length > 2) {
        searchTerm = parts.slice(2).join(' ');
      } else if (parts[1] === 'page' && parts.length > 2) {
        const pageNum = parseInt(parts[2], 10);
        if (Number.isFinite(pageNum) && pageNum > 0) {
          page = pageNum;
        }
      } else if (parts.length === 2) {
        // Try to parse as page number or treat as search term
        const pageNum = parseInt(parts[1], 10);
        if (Number.isFinite(pageNum) && pageNum > 0) {
          page = pageNum;
        } else {
          searchTerm = parts[1];
        }
      }
    }

    const result = await renderUsersList(adminContext.course_id, page, searchTerm);

    if (result.totalUsers === 0) {
      return ctx.reply(result.message);
    }

    // Create pagination buttons
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
    const row: Array<{ text: string; callback_data: string }> = [];

    if (result.hasPrevPage) {
      const prevPage = page - 1;
      const callbackData = searchTerm
        ? `listusers_page_${prevPage}_${encodeURIComponent(searchTerm)}`
        : `listusers_page_${prevPage}`;
      row.push({ text: '◀️ Попередня', callback_data: callbackData });
    }

    if (result.hasNextPage) {
      const nextPage = page + 1;
      const callbackData = searchTerm
        ? `listusers_page_${nextPage}_${encodeURIComponent(searchTerm)}`
        : `listusers_page_${nextPage}`;
      row.push({ text: 'Наступна ▶️', callback_data: callbackData });
    }

    if (row.length > 0) {
      buttons.push(row);
    }

    const replyMarkup = buttons.length > 0
      ? { reply_markup: { inline_keyboard: buttons } }
      : {};

    return ctx.reply(result.message, replyMarkup);
  } catch (e) {
    console.error(e);
    return ctx.reply(USERS_ERROR);
  }
}

export async function listUsersPaginationCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || typeof callbackQuery !== 'object' || !('data' in callbackQuery)) {
    return;
  }

  const callbackData = callbackQuery.data;
  if (typeof callbackData !== 'string' || !callbackData.startsWith('listusers_page_')) {
    return;
  }

  try {
    const adminContext = await getAdminCourseContext(ctx.from.id);
    if (!adminContext?.course_id) {
      return ctx.answerCbQuery('⚠️ Спочатку встанови курс командою /setcourse <slug>');
    }

    // Parse callback data: listusers_page_<page> or listusers_page_<page>_<searchTerm>
    const parts = callbackData.split('_');
    if (parts.length < 3) {
      return ctx.answerCbQuery('⚠️ Помилка при обробці запиту');
    }

    const page = parseInt(parts[2], 10);
    if (!Number.isFinite(page) || page < 1) {
      return ctx.answerCbQuery('⚠️ Некоректний номер сторінки');
    }

    // Check if there's a search term (parts[3] and beyond)
    let searchTerm: string | undefined;
    if (parts.length > 3) {
      searchTerm = decodeURIComponent(parts.slice(3).join('_'));
    }

    const result = await renderUsersList(adminContext.course_id, page, searchTerm);

    if (result.totalUsers === 0) {
      await ctx.editMessageText(result.message);
      return ctx.answerCbQuery('');
    }

    // Create pagination buttons
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
    const row: Array<{ text: string; callback_data: string }> = [];

    if (result.hasPrevPage) {
      const prevPage = page - 1;
      const callbackData = searchTerm
        ? `listusers_page_${prevPage}_${encodeURIComponent(searchTerm)}`
        : `listusers_page_${prevPage}`;
      row.push({ text: '◀️ Попередня', callback_data: callbackData });
    }

    if (result.hasNextPage) {
      const nextPage = page + 1;
      const callbackData = searchTerm
        ? `listusers_page_${nextPage}_${encodeURIComponent(searchTerm)}`
        : `listusers_page_${nextPage}`;
      row.push({ text: 'Наступна ▶️', callback_data: callbackData });
    }

    if (row.length > 0) {
      buttons.push(row);
    }

    const replyMarkup = buttons.length > 0
      ? { reply_markup: { inline_keyboard: buttons } }
      : { reply_markup: { inline_keyboard: [] } };

    await ctx.editMessageText(result.message, replyMarkup);
    await ctx.answerCbQuery('');
  } catch (e) {
    console.error('Error in listUsersPaginationCallback:', e);
    await ctx.answerCbQuery('⚠️ Помилка при завантаженні сторінки');
  }
}

export async function genAccessCodeCommandCallback(ctx: Context) {
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

export async function removeUserCommandCallback(ctx: Context) {
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

      // Get course config and day config
      const courseConfig = COURSES.find((c) => c.slug === courseSlug);
      if (!courseConfig) {
        return ctx.reply('⚠️ Конфігурація курсу не знайдена');
      }

      const dayConfig = getDayConfig(courseConfig, day);

      // If day has difficulty choice, send message with buttons instead of video
      if (dayConfig?.difficultyChoice) {
        await sendDifficultyChoiceMessage(
          bot,
          telegramId,
          courseId,
          day,
          dayConfig.difficultyChoice
        );

        return ctx.reply(SENDDAY_SUCCESS(telegramId, day));
      }

      // Check if video exists for this day (only daily videos)
      const videoRes: any = await db.query(
        'SELECT day FROM course_videos WHERE course_id = $1 AND day = $2 AND video_type = $3',
        [courseId, day, 'daily']
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
