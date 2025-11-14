import { db } from '../db';
import { CourseStaticConfig } from '../types';
import { calculateProgramDay } from './courseService';

/**
 * Check if a lesson is completed
 */
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

/**
 * Get detailed course progress for a user
 */
export async function getCourseProgress(
  userId: number,
  courseId: number,
  courseConfig: CourseStaticConfig
): Promise<{
  currentDay: number;
  completedLessons: number;
  isCompleted: boolean;
}> {
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
    const totalDays = courseConfig.days.length;

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

