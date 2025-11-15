import { Context, Telegraf } from 'telegraf';
import { db } from '../db';
import { COURSES, VIDEO_DIFFICULTY } from '../config';
import {
  dayCaption,
  COMPLETION_BUTTON_TEXT,
} from '../messages';
import { calculateProgramDay, getDayConfig } from './courseService';
import { isLessonCompleted } from './lessonService';

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

    // Get video for this day (default video, difficulty = null)
    const videosRes: any = await db.query(
      'SELECT day, file_id FROM course_videos WHERE course_id = $1 AND day = $2 AND difficulty IS NULL',
      [courseId, day]
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
    });

    // Send video description if available
    if (dayConfig?.videoDescription) {
      // Get user's internal ID to check completion status
      const userRes: any = await db.query(
        'SELECT id FROM users WHERE telegram_id = $1',
        [telegramId]
      );

      if (userRes.rows.length === 0) return;

      const userId = userRes.rows[0].id;
      
      // Build buttons array
      const buttons: Array<{ text: string; callback_data: string }> = [];
      
      // Add completion button if tracking is enabled and lesson not completed
      const isCompletionTrackingEnabled = courseConfig.trackLessonCompletion !== false;
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
          reply_markup: {
            inline_keyboard: [buttons],
          },
        });
      } else {
        await bot.telegram.sendMessage(telegramId, dayConfig.videoDescription);
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
    const courseRows: any = await db.query(
      'SELECT id, slug FROM courses WHERE is_active = TRUE'
    );
    const courses = courseRows.rows as { id: number; slug: string }[];

    for (const course of courses) {
      // Find course config
      const courseConfig = COURSES.find((c) => c.slug === course.slug);

      if (!courseConfig) continue;

      // Skip courses without dailyTime (they are not scheduled)
      if (!courseConfig.dailyTime) continue;

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

      // Check if videos exist for this course (only default videos, difficulty = null)
      const videosRes: any = await db.query(
        'SELECT day, file_id FROM course_videos WHERE course_id = $1 AND difficulty IS NULL ORDER BY day',
        [course.id]
      );
      const videos = videosRes.rows as { day: number; file_id: string }[];

      if (videos.length === 0) continue;

      const sends = enrolled.map(async (user) => {
        const day = calculateProgramDay(user.start_date);
        
        // Get day-specific configuration
        const dayConfig = getDayConfig(courseConfig, day);
        
        // Skip if this day is configured to not auto-send (e.g., day 1 sent via button)
        if (dayConfig?.autoSend === false) {
          return Promise.resolve();
        }
        
        // If day has difficulty choice, send message with buttons instead of video
        if (dayConfig?.difficultyChoice) {
          const difficultyChoice = dayConfig.difficultyChoice;
          const easyText = difficultyChoice.easyButtonText || 'Легший';
          const hardText = difficultyChoice.hardButtonText || 'Складніший';
          
          return bot.telegram.sendMessage(user.telegram_id, difficultyChoice.message, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: easyText, callback_data: `difficulty_${course.id}_${day}_${VIDEO_DIFFICULTY.EASY}` },
                  { text: hardText, callback_data: `difficulty_${course.id}_${day}_${VIDEO_DIFFICULTY.HARD}` },
                ],
              ],
            },
          }).catch((sendErr: Error) => {
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

