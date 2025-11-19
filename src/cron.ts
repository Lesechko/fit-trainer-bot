import cron from 'node-cron';
import { Telegraf, Context } from 'telegraf';
import { TIMEZONE, COURSES } from './config';
import { sendDailyVideos } from './services/videoService';
import { calculateProgramDay, getMotivationMessage } from './services/courseService';

export function scheduleDaily(bot: Telegraf<Context>) {
  // Schedule daily videos only for courses that have dailyTime defined
  // Courses without dailyTime are ignored by the scheduler
  for (const course of COURSES) {
    if (!course.dailyTime) {
      continue; // Skip courses without dailyTime
    }

    const t = course.dailyTime;
    const [hh, mm] = t.split(':');
    const expr = `${Number(mm)} ${Number(hh)} * * *`;

    cron.schedule(
      expr,
      async () => {
        try {
          await sendDailyVideos(bot);
        } catch (error) {
          console.error('Error in scheduleDaily:', error);
        }
      },
      { timezone: TIMEZONE }
    );
  }

  // Motivation messages per course (optional, using static config)
  for (const course of COURSES) {
    const t = course.motivation?.time;
    if (!t) continue;
    const [hh, mm] = t.split(':');
    const expr = `${Number(mm)} ${Number(hh)} * * *`;

    cron.schedule(
      expr,
      async () => {
        try {
          // Fetch enrolled users for this course
          const res: any = await (
            await import('./db')
          ).db.query(
            'SELECT u.telegram_id, uc.start_date FROM user_courses uc JOIN users u ON u.id = uc.user_id JOIN courses c ON c.id = uc.course_id WHERE c.slug = $1',
            [course.slug]
          );
          const enrolled = res.rows as {
            telegram_id: number;
            start_date: string;
          }[];
          if (enrolled.length === 0) return;

          // Send motivation based on each user's current day
          await Promise.all(
            enrolled.map(async (u) => {
              // Calculate user's current day (1-based)
              const currentDay = calculateProgramDay(u.start_date);

              // Check if course is completed
              if (currentDay > course.days.length) {
                return;
              }

              // Get motivation message for this day
              const text = getMotivationMessage(course, currentDay);

              if (!text) {
                return;
              }

              return bot.telegram
                .sendMessage(u.telegram_id, text, {
                  parse_mode: 'HTML',
                })
                .catch((e: Error) =>
                  console.error('Motivation send failed:', e.message)
                );
            })
          );
        } catch (e) {
          console.error('Error in motivation schedule:', e);
        }
      },
      { timezone: TIMEZONE }
    );
  }
}
