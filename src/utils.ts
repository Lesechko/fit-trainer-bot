import { Context, Telegraf } from 'telegraf';
import { ADMIN_ID } from './config';
import { db } from './db';
import { dayCaption } from './messages';
import { COURSES } from './config';

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
    // Multi-course: iterate each course, send to enrolled users only
    const courseRows: any = await db.query('SELECT id, slug FROM courses WHERE is_active = TRUE');
    const courses = courseRows.rows as { id: number; slug: string }[];

    for (const course of courses) {
      // Find course config
      const courseConfig = COURSES.find(c => c.slug === course.slug);
      
      if (!courseConfig) continue;

      // users enrolled to this course with start_date
      const ucRes: any = await db.query(
        'SELECT u.telegram_id, uc.start_date FROM user_courses uc JOIN users u ON u.id = uc.user_id WHERE uc.course_id = $1',
        [course.id]
      );
      const enrolled = ucRes.rows as { telegram_id: number; start_date: string }[];

      if (enrolled.length === 0) continue;

      const videosRes: any = await db.query(
        'SELECT day, file_id FROM course_videos WHERE course_id = $1 ORDER BY day',
        [course.id]
      );
      const videos = videosRes.rows as { day: number; file_id: string }[];

      const sends = enrolled.map((user) => {
        const day = calculateProgramDay(user.start_date);
        const video = videos.find((v) => v.day === day);
        if (!video) return Promise.resolve();

        // Send video with title as caption
        const videoTitle = courseConfig.videoTitles && courseConfig.videoTitles[day - 1] 
          ? courseConfig.videoTitles[day - 1] 
          : dayCaption(day);

        return bot.telegram
          .sendVideo(user.telegram_id, video.file_id, { caption: videoTitle })
          .then(() => {
            // Send video description if available
            if (courseConfig.videoDescriptions && courseConfig.videoDescriptions[day - 1]) {
              return bot.telegram
                .sendMessage(user.telegram_id, courseConfig.videoDescriptions[day - 1])
                .catch((descErr: Error) => {
                  console.error(`Помилка надсилання опису ${user.telegram_id}:`, descErr.message);
                });
            }
          })
          .catch((sendErr: Error) => {
            console.error(`Помилка надсилання ${user.telegram_id}:`, sendErr.message);
          });
      });

      await Promise.all(sends);
    }
  } catch (error) {
    console.error('Error in sendDailyVideos:', error);
    throw error;
  }
}

export function isAdmin(ctx: Context | undefined | null): boolean {
  return Boolean(ADMIN_ID && ctx && (ctx as any).from && (ctx as any).from.id === ADMIN_ID);
}


