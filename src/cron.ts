import cron from 'node-cron';
import { Telegraf, Context } from 'telegraf';
import { QueryResult } from 'pg';
import { TIMEZONE, COURSES } from './config';
import { sendDailyVideos } from './services/videoService';
import { getMotivationMessage } from './services/courseService';
import { EnrolledUserWithDayRow } from './types';

export function scheduleDaily(bot: Telegraf<Context>) {
  for (const course of COURSES) {
    if (!course.dailyTime) {
      continue;
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
    const time = course.motivation?.time;
    if (!time) {
      continue;
    }

    const [hh, mm] = time.split(':');
    const expr = `${Number(mm)} ${Number(hh)} * * *`;

    cron.schedule(
      expr,
      async () => {
        try {
          const totalDays = course.days.length;
          
          // Fetch only active enrolled users (not completed) for this course
          // Calculate current day in SQL and filter out completed users at DB level
          const res: QueryResult<EnrolledUserWithDayRow> = await (
            await import('./db')
          ).db.query(
            `SELECT 
              u.telegram_id, 
              uc.start_date,
              GREATEST(1, FLOOR((CURRENT_DATE - uc.start_date::date) + 1))::integer as current_day
            FROM user_courses uc 
            JOIN users u ON u.id = uc.user_id 
            JOIN courses c ON c.id = uc.course_id 
            WHERE c.slug = $1 
              AND GREATEST(1, FLOOR((CURRENT_DATE - uc.start_date::date) + 1)) <= $2`,
            [course.slug, totalDays]
          );
          const enrolled = res.rows;
          if (enrolled.length === 0) return;

          // Send motivation based on each user's current day
          await Promise.all(
            enrolled.map(async (u) => {
              // Get motivation message for this day
              const text = getMotivationMessage(course, u.current_day);

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
