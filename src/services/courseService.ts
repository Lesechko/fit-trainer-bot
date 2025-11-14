import { CourseStaticConfig, CourseDayConfig } from '../types';
import { COURSES, TIMEZONE } from '../config';

/**
 * Calculate the current program day based on start date
 */
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
 * Get day-specific configuration from a course
 */
export function getDayConfig(
  courseConfig: CourseStaticConfig,
  day: number
): CourseDayConfig | undefined {
  return courseConfig.days.find((d) => d.day === day);
}

/**
 * Get motivation message for a specific day
 * Returns day-specific message if available, otherwise falls back to default messages
 */
export function getMotivationMessage(
  courseConfig: CourseStaticConfig,
  day: number
): string | null {
  const dayConfig = getDayConfig(courseConfig, day);
  
  // Day-specific motivation takes priority
  if (dayConfig?.motivationMessage) {
    return dayConfig.motivationMessage;
  }
  
  // Fallback to default messages
  const defaultMsg = courseConfig.motivation?.defaultMessages?.[day - 1];
  if (defaultMsg) {
    return defaultMsg;
  }
  
  return null;
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

/**
 * Calculate user progress for a course
 */
export function calculateUserProgress(
  startDate: string,
  courseConfig: CourseStaticConfig
): {
  currentDay: number;
  isCompleted: boolean;
  status: string;
} {
  const courseDays = courseConfig.days.length;
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

