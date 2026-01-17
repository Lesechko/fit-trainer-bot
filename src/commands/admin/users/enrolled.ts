import { Context } from 'telegraf';
import { db } from '../../../db';
import { USERS_ERROR, USERS_EMPTY, usersList } from '../../../messages';
import { getCommandParts, getAdminCourseContext } from '../../helpers';
import { COURSES } from '../../../config';
import { formatUserDisplayName } from '../../../services/userHelpers';
import { calculateUserProgress } from '../../../services/courseService';

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

export async function renderUsersList(
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
