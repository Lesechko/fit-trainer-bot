import { Context } from 'telegraf';
import { db } from '../../../db';
import { USERS_ERROR } from '../../../messages';
import { getCommandParts } from '../../helpers';
import { formatUserDisplayName } from '../../../services/userHelpers';

const USERS_PER_PAGE = 20;

async function renderSiteUsersList(
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
      WHERE u.entry_source = 'site' ${searchCondition}
    `
    : `
      SELECT COUNT(*) as total
      FROM users u 
      WHERE u.entry_source = 'site'
    `;
  
  const countParams = searchTerm ? [searchParam] : [];
  const countRes: any = await db.query(countQuery, countParams);
  const totalUsers = parseInt(countRes.rows[0].total, 10);
  const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE));
  
  // Clamp page number
  const validPage = Math.max(1, Math.min(page, totalPages));
  
  if (totalUsers === 0) {
    return {
      message: '📂 Немає користувачів, які прийшли з сайту',
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
        u.created_at,
        u.updated_at
      FROM users u 
      WHERE u.entry_source = 'site' ${searchCondition}
      ORDER BY u.created_at DESC
      LIMIT $3 OFFSET $4
    `
    : `
      SELECT 
        u.telegram_id, 
        u.username,
        u.first_name,
        u.last_name,
        u.language_code,
        u.created_at,
        u.updated_at
      FROM users u 
      WHERE u.entry_source = 'site'
      ORDER BY u.created_at DESC
      LIMIT $2 OFFSET $3
    `;
  
  const usersParams = searchTerm
    ? [searchParam, USERS_PER_PAGE, offset]
    : [USERS_PER_PAGE, offset];
  
  const usersRes: any = await db.query(usersQuery, usersParams);
  const users = usersRes.rows;
  
  // Format users list
  const list = users
    .map((u: any) => {
      const displayName = formatUserDisplayName(u);
      const createdDate = new Date(u.created_at).toLocaleDateString('uk-UA');
      return `👤 ${displayName} (${u.telegram_id}) | Зареєстровано: ${createdDate}`;
    })
    .join('\n');
  
  const pageInfo = totalPages > 1 ? `\n📄 Сторінка ${validPage} з ${totalPages}` : '';
  const searchInfo = searchTerm ? `\n🔍 Пошук: "${searchTerm}"` : '';
  const message = `🌐 Користувачі з сайту (всього: ${totalUsers})${searchInfo}${pageInfo}:\n\n${list}`;
  
  return {
    message,
    totalPages,
    totalUsers,
    hasNextPage: validPage < totalPages,
    hasPrevPage: validPage > 1,
  };
}

export async function listSiteUsersCommandCallback(ctx: Context) {
  try {
    const parts = getCommandParts(ctx);
    let page = 1;
    let searchTerm: string | undefined;

    // Parse command arguments
    // Format: /listsiteusers [search <term>] | [page <num>]
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

    const result = await renderSiteUsersList(page, searchTerm);

    if (result.totalUsers === 0) {
      return ctx.reply(result.message);
    }

    // Create pagination buttons
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
    const row: Array<{ text: string; callback_data: string }> = [];

    if (result.hasPrevPage) {
      const prevPage = page - 1;
      const callbackData = searchTerm
        ? `listsiteusers_page_${prevPage}_${encodeURIComponent(searchTerm)}`
        : `listsiteusers_page_${prevPage}`;
      row.push({ text: '◀️ Попередня', callback_data: callbackData });
    }

    if (result.hasNextPage) {
      const nextPage = page + 1;
      const callbackData = searchTerm
        ? `listsiteusers_page_${nextPage}_${encodeURIComponent(searchTerm)}`
        : `listsiteusers_page_${nextPage}`;
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

export async function listSiteUsersPaginationCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !('data' in callbackQuery)) {
    return;
  }

  const callbackData = callbackQuery.data as string;

  try {
    // Parse callback data: listsiteusers_page_<page> or listsiteusers_page_<page>_<search>
    const parts = callbackData.split('_');
    if (parts.length < 3 || parts[0] !== 'listsiteusers' || parts[1] !== 'page') {
      return;
    }

    const page = parseInt(parts[2], 10);
    if (!Number.isFinite(page) || page < 1) {
      return;
    }

    let searchTerm: string | undefined;
    if (parts.length > 3) {
      searchTerm = decodeURIComponent(parts.slice(3).join('_'));
    }

    const result = await renderSiteUsersList(page, searchTerm);

    if (result.totalUsers === 0) {
      await ctx.answerCbQuery('📂 Немає користувачів');
      await ctx.editMessageText(result.message);
      return;
    }

    // Create pagination buttons
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
    const row: Array<{ text: string; callback_data: string }> = [];

    if (result.hasPrevPage) {
      const prevPage = page - 1;
      const callbackData = searchTerm
        ? `listsiteusers_page_${prevPage}_${encodeURIComponent(searchTerm)}`
        : `listsiteusers_page_${prevPage}`;
      row.push({ text: '◀️ Попередня', callback_data: callbackData });
    }

    if (result.hasNextPage) {
      const nextPage = page + 1;
      const callbackData = searchTerm
        ? `listsiteusers_page_${nextPage}_${encodeURIComponent(searchTerm)}`
        : `listsiteusers_page_${nextPage}`;
      row.push({ text: 'Наступна ▶️', callback_data: callbackData });
    }

    if (row.length > 0) {
      buttons.push(row);
    }

    const replyMarkup = buttons.length > 0
      ? { reply_markup: { inline_keyboard: buttons } }
      : {};

    await ctx.editMessageText(result.message, replyMarkup);
    await ctx.answerCbQuery();
  } catch (e) {
    console.error('Error in listSiteUsersPaginationCallback:', e);
    await ctx.answerCbQuery('⚠️ Помилка при завантаженні');
  }
}
