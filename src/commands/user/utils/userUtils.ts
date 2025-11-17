import { Context } from 'telegraf';
import { QueryResult } from 'pg';
import { db } from '../../../db';
import { UserRow } from '../../../types';
import { ExistingCourseRow } from './enrollmentTypes';

export async function ensureUserExists(ctx: Context): Promise<number | null> {
  const telegramId = ctx.from!.id;
  const userRes: QueryResult<Pick<UserRow, 'id'>> = await db.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name, language_code, updated_at) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     ON CONFLICT (telegram_id) DO UPDATE SET 
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       language_code = EXCLUDED.language_code,
       updated_at = CASE 
         WHEN users.username IS DISTINCT FROM EXCLUDED.username 
           OR users.first_name IS DISTINCT FROM EXCLUDED.first_name
           OR users.last_name IS DISTINCT FROM EXCLUDED.last_name
           OR users.language_code IS DISTINCT FROM EXCLUDED.language_code
         THEN EXCLUDED.updated_at
         ELSE users.updated_at
       END
     RETURNING id`,
    [
      telegramId,
      ctx.from!.username || null,
      ctx.from!.first_name || null,
      ctx.from!.last_name || null,
      ctx.from!.language_code || null,
      new Date().toISOString(),
    ]
  );
  return userRes.rows[0]?.id || null;
}

export async function getExistingEnrollment(
  userId: number
): Promise<ExistingCourseRow | null> {
  const existingEnrollmentRes: QueryResult<ExistingCourseRow> = await db.query(
    'SELECT c.title, c.id as course_id, c.slug FROM user_courses uc JOIN courses c ON c.id = uc.course_id WHERE uc.user_id = $1',
    [userId]
  );
  return existingEnrollmentRes.rows[0] || null;
}
