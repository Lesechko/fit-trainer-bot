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
 * Returns YYYY-MM-DD for today in course timezone.
 * Since day 1 video is sent immediately after enrollment (via button),
 * the start date should be the actual enrollment date, not the next day.
 */
export function getEnrollmentStartDateForCourse(
  courseSlug: string,
  now: Date = new Date()
): string {
  const timeZone = TIMEZONE || 'Europe/Kyiv';

  // Get current date in course timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));

  // Build date from TZ calendar components at UTC midnight
  const startUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const startDate = new Date(startUtc);

  return startDate.toISOString().split('T')[0];
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

