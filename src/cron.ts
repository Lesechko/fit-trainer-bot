import cron from 'node-cron';
import { Telegraf, Context } from 'telegraf';
import { TIMEZONE, COURSES } from './config';
import { sendDailyVideos, calculateProgramDay } from './utils';

export function scheduleDaily(bot: Telegraf<Context>) {
  // If any course defines dailyTime, schedule per course; otherwise default 09:00
  const anyHasDaily = COURSES.some((c) => c.dailyTime);
  if (anyHasDaily) {
    for (const course of COURSES) {
      const t = course.dailyTime || '09:00';
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
  } else {
    cron.schedule(
      '0 9 * * *',
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

          const msgs = course.motivation?.messages || [];

          if (msgs.length === 0) return;

          // Send motivation based on each user's current day
          await Promise.all(
            enrolled.map(async (u) => {
              // Calculate user's current day (1-based)
              const currentDay = calculateProgramDay(u.start_date);

              // Check if course is completed
              if (currentDay > course.days) {
                return;
              }

              const msgIndex = currentDay - 1;

              if (!msgs[msgIndex]) {
                return;
              }

              const text = msgs[msgIndex];

              return bot.telegram
                .sendMessage(u.telegram_id, text)
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
