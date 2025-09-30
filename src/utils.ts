import { Context, Telegraf } from 'telegraf';
import { ADMIN_ID } from './config';
import { db } from './db';
import { dayCaption } from './messages';

export function calculateProgramDay(startDateISO: string, now: Date = new Date()): number {
  const [y, m, d] = startDateISO.split('-').map((n) => Number(n));
  if (!y || !m || !d) return 1;
  const startUTC = Date.UTC(y, m - 1, d, 0, 0, 0);
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);
  const diffDays = Math.floor((nowUTC - startUTC) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

export async function sendDailyVideos(bot: Telegraf<Context>): Promise<void> {
  try {
    // Get all users
    const usersResult: any = await db.query(
      'SELECT telegram_id, start_date FROM users'
    );
    const users = usersResult.rows as { telegram_id: number; start_date: string }[];

    // Get all videos
    const videosResult: any = await db.query(
      'SELECT day, file_id FROM videos ORDER BY day'
    );
    const videos = videosResult.rows as { day: number; file_id: string }[];

    const promises = users.map((user) => {
      const day = calculateProgramDay(user.start_date);
      const video = videos.find(v => v.day === day);

      if (video) {
        return bot.telegram
          .sendVideo(user.telegram_id, video.file_id, {
            caption: dayCaption(day),
          })
          .catch((sendErr: Error) => {
            console.error(
              `Помилка надсилання ${user.telegram_id}:`,
              sendErr.message
            );
          });
      }

      return Promise.resolve();
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Error in sendDailyVideos:', error);
    throw error;
  }
}

export function isAdmin(ctx: Context | undefined | null): boolean {
  return Boolean(ADMIN_ID && ctx && (ctx as any).from && (ctx as any).from.id === ADMIN_ID);
}


