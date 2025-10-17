import { Context, Telegraf } from 'telegraf';
import { ADMIN_ID } from './config';
import { db } from './db';
import { dayCaption, NEW_USER_ENROLLMENT_NOTIFICATION, COMPLETION_BUTTON_TEXT, COMPLETION_BUTTON_DISABLED_TEXT } from './messages';
import { COURSES, TIMEZONE } from './config';

export function calculateProgramDay(
  startDateISO: string,
  now: Date = new Date()
): number {
  const [y, m, d] = startDateISO.split('-').map((n) => Number(n));
  if (!y || !m || !d) return 1;
  const startUTC = Date.UTC(y, m - 1, d, 0, 0, 0);
  const nowUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0
  );

  const diffDays = Math.floor((nowUTC - startUTC) / (1000 * 60 * 60 * 24));

  return Math.max(1, diffDays + 1);
}

/**
 * Returns YYYY-MM-DD in course timezone, anchored to course dailyTime.
 * If user enrolls after dailyTime (in course TZ), start date is next day.
 */
export function getEnrollmentStartDateForCourse(
  courseSlug: string,
  now: Date = new Date()
): string {
  const courseConfig = COURSES.find((c) => c.slug === courseSlug);
  const timeZone = TIMEZONE || 'Europe/Kyiv';
  const dailyTime = courseConfig?.dailyTime || '19:00';

  const [sendHourStr, sendMinStr] = dailyTime.split(':');
  const sendHour = Number(sendHourStr);
  const sendMinute = Number(sendMinStr);

  // Get current Y-M-D H:M in target timezone via formatToParts
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));

  const afterSendTime =
    hour > sendHour || (hour === sendHour && minute >= sendMinute);

  // Build date from TZ calendar components at UTC midnight
  const baseUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const startUtc = new Date(
    baseUtc + (afterSendTime ? 24 : 0) * 60 * 60 * 1000
  );

  return startUtc.toISOString().split('T')[0];
}

export async function sendDailyVideos(bot: Telegraf<Context>): Promise<void> {
  try {
    // Multi-course: iterate each course, send to enrolled users only
    const courseRows: any = await db.query(
      'SELECT id, slug FROM courses WHERE is_active = TRUE'
    );
    const courses = courseRows.rows as { id: number; slug: string }[];

    for (const course of courses) {
      // Find course config
      const courseConfig = COURSES.find((c) => c.slug === course.slug);

      if (!courseConfig) continue;

      // users enrolled to this course with start_date
      const ucRes: any = await db.query(
        'SELECT u.telegram_id, uc.start_date FROM user_courses uc JOIN users u ON u.id = uc.user_id WHERE uc.course_id = $1',
        [course.id]
      );
      const enrolled = ucRes.rows as {
        telegram_id: number;
        start_date: string;
      }[];

      if (enrolled.length === 0) continue;

      const videosRes: any = await db.query(
        'SELECT day, file_id FROM course_videos WHERE course_id = $1 ORDER BY day',
        [course.id]
      );
      const videos = videosRes.rows as { day: number; file_id: string }[];

      const sends = enrolled.map(async (user) => {
        const day = calculateProgramDay(user.start_date);
        const video = videos.find((v) => v.day === day);
        if (!video) return Promise.resolve();

        // Send video with title as caption
        const videoTitle =
          courseConfig.videoTitles && courseConfig.videoTitles[day - 1]
            ? courseConfig.videoTitles[day - 1]
            : dayCaption(day);

        return bot.telegram
          .sendVideo(user.telegram_id, video.file_id, { caption: videoTitle })
          .then(async () => {
            // Send video description if available
            if (
              courseConfig.videoDescriptions &&
              courseConfig.videoDescriptions[day - 1]
            ) {
              // Check if lesson is already completed
              const userRes: any = await db.query(
                'SELECT id FROM users WHERE telegram_id = $1',
                [user.telegram_id]
              );
              
              if (userRes.rows.length === 0) return;

              const userId = userRes.rows[0].id;
              const isCompleted = await isLessonCompleted(userId, course.id, day);

              // Only show button if lesson is not completed
              if (!isCompleted) {
                const button = {
                  text: COMPLETION_BUTTON_TEXT,
                  callback_data: `complete_${course.id}_${day}`
                };

                return bot.telegram
                  .sendMessage(
                    user.telegram_id,
                    courseConfig.videoDescriptions[day - 1],
                    {
                      reply_markup: {
                        inline_keyboard: [[button]]
                      }
                    }
                  )
                  .catch((descErr: Error) => {
                    console.error(
                      `Помилка надсилання опису ${user.telegram_id}:`,
                      descErr.message
                    );
                  });
              } else {
                // Send description without button for completed lessons
                return bot.telegram
                  .sendMessage(user.telegram_id, courseConfig.videoDescriptions[day - 1])
                  .catch((descErr: Error) => {
                    console.error(
                      `Помилка надсилання опису ${user.telegram_id}:`,
                      descErr.message
                    );
                  });
              }
            }
          })
          .catch((sendErr: Error) => {
            console.error(
              `Помилка надсилання ${user.telegram_id}:`,
              sendErr.message
            );
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
  return Boolean(
    ADMIN_ID && ctx && (ctx as any).from && (ctx as any).from.id === ADMIN_ID
  );
}

export function formatUserDisplayName(user: {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  if (user.first_name) {
    let displayName = user.first_name;
    if (user.last_name) displayName += ` ${user.last_name}`;
    return displayName;
  } else if (user.username) {
    return `@${user.username}`;
  } else {
    return `ID:${user.telegram_id}`;
  }
}

export function calculateUserProgress(
  startDate: string,
  courseDays: number
): {
  currentDay: number;
  isCompleted: boolean;
  status: string;
} {
  const start = new Date(startDate);
  const now = new Date();
  const diffTime = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const currentDay = Math.max(1, Math.min(diffDays, courseDays));
  const isCompleted = diffDays > courseDays;

  const status = isCompleted
    ? '✅ Завершено'
    : `📅 День ${currentDay}/${courseDays}`;

  return { currentDay, isCompleted, status };
}

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

export async function isLessonCompleted(
  userId: number,
  courseId: number,
  day: number
): Promise<boolean> {
  try {
    const result: any = await db.query(
      'SELECT id FROM lesson_completions WHERE user_id = $1 AND course_id = $2 AND day = $3',
      [userId, courseId, day]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking lesson completion:', error);
    return false;
  }
}

export async function getCourseProgress(
  userId: number,
  courseId: number,
  totalDays: number
): Promise<{ currentDay: number; completedLessons: number; isCompleted: boolean }> {
  try {
    // Get user's enrollment start date
    const enrollmentRes: any = await db.query(
      'SELECT start_date FROM user_courses WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );
    
    if (enrollmentRes.rows.length === 0) {
      return { currentDay: 0, completedLessons: 0, isCompleted: false };
    }
    
    const startDate = enrollmentRes.rows[0].start_date;
    
    // Calculate current day based on start date (same logic as /day command)
    const currentDay = calculateProgramDay(startDate);
    
    // Get completed lessons count
    const completedRes: any = await db.query(
      'SELECT COUNT(*) as count FROM lesson_completions WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );
    
    const completedLessons = parseInt(completedRes.rows[0].count);
    const isCompleted = completedLessons >= totalDays;
    
    return { currentDay, completedLessons, isCompleted };
  } catch (error) {
    console.error('Error getting course progress:', error);
    return { currentDay: 0, completedLessons: 0, isCompleted: false };
  }
}
