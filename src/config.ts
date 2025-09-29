import 'dotenv/config';

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

export const TIMEZONE = process.env.TZ || 'UTC';

export const DATABASE_URL: string = (() => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
})();

