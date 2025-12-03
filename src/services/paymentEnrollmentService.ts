import { Telegraf, Context } from 'telegraf';
import { db } from '../db';
import { getEnrollmentStartDateForCourse } from './courseService';
import { COURSES } from '../config';
import { notifyAdminNewEnrollment } from './userService';
import { START_DAY_1_BUTTON_TEXT } from '../messages';

/**
 * Enroll user in course after successful payment
 */
export async function enrollUserFromPayment(
  bot: Telegraf<Context>,
  userId: number,
  courseId: number
): Promise<void> {
  try {
    // Get course slug
    const courseResult = await db.query('SELECT slug FROM courses WHERE id = $1', [courseId]);
    if (courseResult.rows.length === 0) {
      throw new Error(`Course not found: ${courseId}`);
    }
    const courseSlug = courseResult.rows[0].slug;

    // Check if user is already enrolled
    const existingEnrollment = await db.query(
      'SELECT id FROM user_courses WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );

    if (existingEnrollment.rows.length > 0) {
      console.log(`User ${userId} is already enrolled in course ${courseId}`);
      return;
    }

    // Get start date
    const startDate = getEnrollmentStartDateForCourse(courseSlug);

    // Enroll user
    await db.query(
      'INSERT INTO user_courses (user_id, course_id, start_date) VALUES ($1, $2, $3) ON CONFLICT (user_id, course_id) DO NOTHING',
      [userId, courseId, startDate]
    );

    // Get user info for notification
    const userResult = await db.query(
      'SELECT telegram_id, username, first_name, last_name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error(`User not found: ${userId}`);
    }

    const user = userResult.rows[0];

    // Notify admin
    await notifyAdminNewEnrollment(
      bot,
      {
        telegram_id: user.telegram_id,
        username: user.username || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
      },
      courseSlug,
      startDate
    );

    // Send welcome message to user
    const course = COURSES.find((c) => c.slug === courseSlug);
    if (course?.welcome) {
      const startButton = {
        text: START_DAY_1_BUTTON_TEXT,
        callback_data: `start_day_1_${courseId}`,
      };

      try {
        await bot.telegram.sendMessage(user.telegram_id, course.welcome, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[startButton]],
          },
        });
      } catch (error) {
        console.error(`Failed to send welcome message to user ${user.telegram_id}:`, error);
      }
    }

    console.log(`Successfully enrolled user ${userId} in course ${courseId}`);
  } catch (error) {
    console.error('Error enrolling user from payment:', error);
    throw error;
  }
}

