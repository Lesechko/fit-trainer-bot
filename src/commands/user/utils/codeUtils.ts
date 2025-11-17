import { QueryResult } from 'pg';
import { db } from '../../../db';
import { CodeRow } from './enrollmentTypes';

export async function validateAndLoadCode(code: string): Promise<CodeRow | null> {
  const codeRes: QueryResult<CodeRow> = await db.query(
    'SELECT cac.id, cac.code, cac.course_id, cac.expires_at, cac.is_used, c.slug FROM course_access_codes cac JOIN courses c ON c.id = cac.course_id WHERE cac.code = $1',
    [code]
  );
  const row = codeRes.rows[0];

  if (!row) {
    return null;
  }

  if (row.is_used) {
    return null;
  }

  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return null;
  }

  return row;
}

