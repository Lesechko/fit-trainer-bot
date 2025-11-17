import { Context } from 'telegraf';
import { QueryResult } from 'pg';
import { db } from '../../../db';
import { COURSES } from '../../../config';
import { getCourseProgress } from '../../../services/lessonService';
import {
  COURSE_NOT_FOUND,
  COURSE_IN_PROGRESS_RESTART,
  RESTART_BUTTON_TEXT,
  CANCEL_BUTTON_TEXT,
} from '../../../messages';
import { CourseAccessCodeRow } from '../../../types';
import { getExistingEnrollment } from './userUtils';
import { ExistingCourseRow } from './enrollmentTypes';

export async function cleanupCompletedCourse(
  userId: number,
  courseId: number,
  code: string
): Promise<void> {
  await db.query(
    'DELETE FROM lesson_completions WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );
  await db.query(
    'DELETE FROM user_courses WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );

  const codeCheckRes: QueryResult<Pick<CourseAccessCodeRow, 'id' | 'course_id' | 'is_used' | 'used_by'>> = await db.query(
    'SELECT id, course_id, is_used, used_by FROM course_access_codes WHERE code = $1',
    [code]
  );

  if (codeCheckRes.rows.length > 0) {
    const codeInfo = codeCheckRes.rows[0];
    if (codeInfo && codeInfo.course_id === courseId && codeInfo.is_used && codeInfo.used_by === userId) {
      await db.query(
        'UPDATE course_access_codes SET is_used = FALSE, used_by = NULL, used_at = NULL WHERE id = $1',
        [codeInfo.id]
      );
    }
  }
}

export async function handleExistingEnrollment(
  ctx: Context,
  userId: number,
  code: string
): Promise<boolean> {
  const existingCourse = await getExistingEnrollment(userId);
  if (!existingCourse) {
    return true;
  }

  const courseConfig = COURSES.find((c) => c.slug === existingCourse.slug);
  if (!courseConfig) {
    await ctx.reply(COURSE_NOT_FOUND);
    return false;
  }

  const progress = await getCourseProgress(
    userId,
    existingCourse.course_id,
    courseConfig
  );

  if (progress.isCompleted) {
    await cleanupCompletedCourse(userId, existingCourse.course_id, code);
    return true;
  } else {
    const totalDays = courseConfig.days.length;
    const currentDay = Math.min(progress.currentDay, totalDays);
    const restartButton = {
      text: RESTART_BUTTON_TEXT,
      callback_data: `restart_${existingCourse.course_id}_${code}`,
    };
    const cancelButton = {
      text: CANCEL_BUTTON_TEXT,
      callback_data: 'cancel_restart',
    };

    await ctx.reply(
      COURSE_IN_PROGRESS_RESTART(
        existingCourse.title,
        currentDay,
        totalDays
      ),
      {
        reply_markup: {
          inline_keyboard: [[restartButton], [cancelButton]],
        },
      }
    );
    return false;
  }
}

export async function enrollUserInCourse(
  userId: number,
  codeRow: { course_id: number; id: number },
  startDate: string
): Promise<void> {
  await db.query(
    'INSERT INTO user_courses (user_id, course_id, start_date) VALUES ($1, $2, $3) ON CONFLICT (user_id, course_id) DO NOTHING',
    [userId, codeRow.course_id, startDate]
  );

  await db.query(
    'UPDATE course_access_codes SET is_used = TRUE, used_by = $1, used_at = $2 WHERE id = $3',
    [userId, new Date().toISOString(), codeRow.id]
  );
}
