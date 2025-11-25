import { Context, Telegraf } from 'telegraf';
import { QueryResult } from 'pg';
import { db } from '../db';
import { COURSES, VIDEO_DIFFICULTY } from '../config';
import { dayCaption, COMPLETION_BUTTON_TEXT } from '../messages';
import { getDayConfig } from './courseService';
import { isLessonCompleted } from './lessonService';
import {
  CourseVideoRow,
  UserRow,
  CourseRow,
  DifficultyChoice,
  EnrolledUserWithDayRow,
} from '../types';

/**
 * Send difficulty choice message with buttons to a user
 */
export async function sendDifficultyChoiceMessage(
  bot: Telegraf<Context>,
  telegramId: number,
  courseId: number,
  day: number,
  difficultyChoice: DifficultyChoice
): Promise<void> {
  const easyText = difficultyChoice.easyButtonText || 'Легший';
  const hardText = difficultyChoice.hardButtonText || 'Складніший';

  await bot.telegram.sendMessage(telegramId, difficultyChoice.message, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: easyText,
            callback_data: `difficulty_${courseId}_${day}_${VIDEO_DIFFICULTY.EASY}`,
          },
          {
            text: hardText,
            callback_data: `difficulty_${courseId}_${day}_${VIDEO_DIFFICULTY.HARD}`,
          },
        ],
      ],
    },
  });
}

/**
 * Send a specific day's video to a user
 */
export async function sendDayVideoToUser(
  bot: Telegraf<Context>,
  telegramId: number,
  courseId: number,
  courseSlug: string,
  day: number
): Promise<void> {
  try {
    // Find course config
    const courseConfig = COURSES.find((c) => c.slug === courseSlug);
    if (!courseConfig) {
      console.error(`Course config not found for slug: ${courseSlug}`);
      return;
    }

    // Get video for this day (only daily videos, not reference videos)
    const videosRes: QueryResult<Pick<CourseVideoRow, 'day' | 'file_id'>> =
      await db.query(
        'SELECT day, file_id FROM course_videos WHERE course_id = $1 AND day = $2 AND video_type = $3',
        [courseId, day, 'daily']
      );
    const videoRow = videosRes.rows[0];

    if (!videoRow?.file_id) {
      console.error(`Video not found for course ${courseId}, day ${day}`);
      return;
    }

    // Get day-specific configuration
    const dayConfig = getDayConfig(courseConfig, day);

    // Send video with title as caption
    const videoTitle = dayConfig?.videoTitle || dayCaption(day);

    await bot.telegram.sendVideo(telegramId, videoRow.file_id, {
      caption: videoTitle,
      parse_mode: 'HTML',
    });

    // Send video description if available
    if (dayConfig?.videoDescription) {
      // Get user's internal ID to check completion status
      const userRes: QueryResult<Pick<UserRow, 'id'>> = await db.query(
        'SELECT id FROM users WHERE telegram_id = $1',
        [telegramId]
      );

      if (userRes.rows.length === 0) return;

      const userId = userRes.rows[0].id;

      // Build buttons array
      const buttons: Array<{ text: string; callback_data: string }> = [];

      // Add completion button if tracking is enabled and lesson not completed
      const isCompletionTrackingEnabled =
        courseConfig.trackLessonCompletion !== false;
      if (isCompletionTrackingEnabled) {
        const isCompleted = await isLessonCompleted(userId, courseId, day);

        if (!isCompleted) {
          buttons.push({
            text: COMPLETION_BUTTON_TEXT,
            callback_data: `complete_${courseId}_${day}`,
          });
        }
      }

      // Add custom buttons (always show - prevent multiple clicks in handler, not here)
      // This allows admin resends and daily scheduler to show buttons again
      if (dayConfig?.customButtons && dayConfig.customButtons.length > 0) {
        for (const customButton of dayConfig.customButtons) {
          buttons.push({
            text: customButton.text,
            callback_data: `custom_${courseId}_${day}_${customButton.id}`,
          });
        }
      }

      // Send description with buttons if any, otherwise just description
      if (buttons.length > 0) {
        await bot.telegram.sendMessage(telegramId, dayConfig.videoDescription, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [buttons],
          },
        });
      } else {
        await bot.telegram.sendMessage(telegramId, dayConfig.videoDescription, {
          parse_mode: 'HTML',
        });
      }
    }
  } catch (error) {
    console.error(
      `Error sending day ${day} video to user ${telegramId}:`,
      error
    );
  }
}

/**
 * Send daily videos to all enrolled users based on their progress
 */
export async function sendDailyVideos(bot: Telegraf<Context>): Promise<void> {
  try {
    // Multi-course: iterate each course, send to enrolled users only
    const courseRows: QueryResult<Pick<CourseRow, 'id' | 'slug'>> =
      await db.query('SELECT id, slug FROM courses WHERE is_active = TRUE');
    const courses = courseRows.rows;

    for (const course of courses) {
      // Find course config
      const courseConfig = COURSES.find((c) => c.slug === course.slug);

      if (!courseConfig) continue;

      // Skip courses without dailyTime (they are not scheduled)
      if (!courseConfig.dailyTime) continue;

      const totalDays =  courseConfig.reviewFormUrl ? courseConfig.days.length + 1 : courseConfig.days.length;

      // Check if videos exist for this course (only daily videos, not reference videos)
      const videosRes: QueryResult<Pick<CourseVideoRow, 'day' | 'file_id'>> =
        await db.query(
          'SELECT day, file_id FROM course_videos WHERE course_id = $1 AND video_type = $2 ORDER BY day',
          [course.id, 'daily']
        );
      const videos = videosRes.rows;

      if (videos.length === 0) continue;

      // Fetch active enrolled users (including those who just completed)
      // Include users up to 1 day after course completion for review form
      const ucRes: QueryResult<EnrolledUserWithDayRow> = await db.query(
        `SELECT 
          u.telegram_id, 
          uc.start_date,
          GREATEST(1, FLOOR((CURRENT_DATE - uc.start_date::date) + 1))::integer as current_day
        FROM user_courses uc 
        JOIN users u ON u.id = uc.user_id 
        WHERE uc.course_id = $1 
          AND GREATEST(1, FLOOR((CURRENT_DATE - uc.start_date::date) + 1)) <= $2`,
        [course.id, totalDays ]
      );
      const enrolled = ucRes.rows;

      if (enrolled.length === 0) continue;

      const sends = enrolled.map(async (user) => {
        const day = user.current_day;

        // On the day after course completion, send review form (if configured)
        if (day === totalDays && courseConfig.reviewFormUrl) {
          const reviewMessage = `🎉 Вітаю з завершенням курсу!\n\nБуду дуже вдячна, якщо ти залишиш відгук про курс. Це допоможе мені покращити програму та допомогти іншим людям.\n\nПісля відгуку ти отримаєш бонусне відео! 🎁`;

          return bot.telegram
            .sendMessage(user.telegram_id, reviewMessage, {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '📝 Залишити відгук',
                      url: courseConfig.reviewFormUrl,
                    },
                  ],
                  [
                    {
                      text: '✅ Я залишив(ла) відгук',
                      callback_data: `review_completed_${course.id}`,
                    },
                  ],
                ],
              },
            })
            .catch((sendErr: Error) => {
              console.error(
                `Помилка надсилання форми відгуку для ${user.telegram_id}:`,
                sendErr.message
              );
            });
        }

        // Get day-specific configuration
        const dayConfig = getDayConfig(courseConfig, day);

        // Skip if this day is configured to not auto-send (e.g., day 1 sent via button)
        if (dayConfig?.autoSend === false) {
          return Promise.resolve();
        }

        // If day has difficulty choice, send message with buttons instead of video
        if (dayConfig?.difficultyChoice) {
          return sendDifficultyChoiceMessage(
            bot,
            user.telegram_id,
            course.id,
            day,
            dayConfig.difficultyChoice
          ).catch((sendErr: Error) => {
            console.error(
              `Помилка надсилання запиту на складність для ${user.telegram_id}:`,
              sendErr.message
            );
          });
        }

        // Check if video exists for this day
        const video = videos.find((v) => v.day === day);
        if (!video) return Promise.resolve();

        // Use the shared function to send the video
        return sendDayVideoToUser(
          bot,
          user.telegram_id,
          course.id,
          course.slug,
          day
        ).catch((sendErr: Error) => {
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
