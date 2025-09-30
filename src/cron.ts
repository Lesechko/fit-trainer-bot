import cron from 'node-cron';
import { Telegraf, Context } from 'telegraf';
import { TIMEZONE } from './config';
import { sendDailyVideos } from './utils';
import { COURSES } from './config';

export function scheduleDaily(bot: Telegraf<Context>) {
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
          const res: any = await (await import('./db')).db.query(
            'SELECT u.telegram_id, uc.start_date FROM user_courses uc JOIN users u ON u.id = uc.user_id JOIN courses c ON c.id = uc.course_id WHERE c.slug = $1',
            [course.slug]
          );
          const enrolled = res.rows as { telegram_id: number; start_date: string }[];
          if (enrolled.length === 0) return;

          const msgs = course.motivation?.messages || [];
          if (msgs.length === 0) return;

          // Send the motivation message of the day (cycle through)
          const todayIdx = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % msgs.length;
          const text = msgs[todayIdx];

          await Promise.all(
            enrolled.map((u) =>
              bot.telegram
                .sendMessage(u.telegram_id, text)
                .catch((e: Error) => console.error('Motivation send failed:', e.message))
            )
          );
        } catch (e) {
          console.error('Error in motivation schedule:', e);
        }
      },
      { timezone: TIMEZONE }
    );
  }
}
