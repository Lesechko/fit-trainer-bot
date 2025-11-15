import 'dotenv/config';
import { healthyJoints } from './courses/1_healthy-joints';
import { CourseStaticConfig } from './types';

export const BOT_TOKEN: string = (() => {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is not set');
  return token;
})();

const adminIdEnv = process.env.ADMIN_ID;
const parsedAdminId = adminIdEnv ? Number(adminIdEnv) : NaN;
export const ADMIN_ID: number | null = Number.isFinite(parsedAdminId)
  ? parsedAdminId
  : null;

export const TIMEZONE = process.env.TZ || 'Europe/Kyiv';

export const DATABASE_URL: string = (() => {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  return url;
})();

export const BOT_USERNAME = process.env.BOT_USERNAME || '';

export const COURSES: CourseStaticConfig[] = [healthyJoints];

// Video difficulty levels
export const VIDEO_DIFFICULTY = {
  EASY: 'easy',
  HARD: 'hard',
} as const;

export type VideoDifficulty = typeof VIDEO_DIFFICULTY[keyof typeof VIDEO_DIFFICULTY] | null;
