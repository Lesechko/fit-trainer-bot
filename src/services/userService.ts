import { Context, Telegraf } from 'telegraf';
import { ADMIN_ID } from '../config';
import { COURSES } from '../config';
import { NEW_USER_ENROLLMENT_NOTIFICATION } from '../messages';
import { formatUserDisplayName } from './userHelpers';

/**
 * Check if a user is an admin
 */
export function isAdmin(ctx: Context | undefined | null): boolean {
  return Boolean(
    ADMIN_ID && ctx && (ctx as any).from && (ctx as any).from.id === ADMIN_ID
  );
}

/**
 * Send notification to admin about new user enrollment
 */
export async function notifyAdminNewEnrollment(
  bot: Telegraf<Context>,
  user: {
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
  },
  courseSlug: string,
  startDate: string
): Promise<void> {
  if (!ADMIN_ID) {
    console.log('ADMIN_ID not set, skipping notification');
    return;
  }

  try {
    // Get course title from config
    const courseConfig = COURSES.find((c) => c.slug === courseSlug);
    const courseTitle = courseConfig?.title || courseSlug;

    // Format user display name
    const userDisplayName = formatUserDisplayName(user);

    // Send notification to admin
    const notificationMessage = NEW_USER_ENROLLMENT_NOTIFICATION(
      userDisplayName,
      user.telegram_id,
      courseTitle,
      courseSlug,
      startDate
    );

    await bot.telegram.sendMessage(ADMIN_ID, notificationMessage);
  } catch (error) {
    console.error('Failed to send admin notification:', error);
  }
}

