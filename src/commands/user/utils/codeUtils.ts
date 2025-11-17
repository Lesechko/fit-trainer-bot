import { QueryResult } from 'pg';
import { db } from '../../../db';
import { CodeRow } from './enrollmentTypes';
import { CourseAccessCodeRow } from '../../../types';
import { getExistingEnrollment } from './userUtils';

export type CodeValidationResult = {
  codeRow: CodeRow | null;
  isUsed: boolean;
};

export async function validateAndLoadCode(
  code: string,
  userId?: number
): Promise<CodeValidationResult> {
  const codeRes: QueryResult<
    CodeRow & Pick<CourseAccessCodeRow, 'used_by'>
  > = await db.query(
    'SELECT cac.id, cac.code, cac.course_id, cac.expires_at, cac.is_used, cac.used_by, c.slug FROM course_access_codes cac JOIN courses c ON c.id = cac.course_id WHERE cac.code = $1',
    [code]
  );
  const row = codeRes.rows[0];

  if (!row) {
    return { codeRow: null, isUsed: false };
  }

  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { codeRow: null, isUsed: false };
  }

  const codeRow: CodeRow = {
    id: Number(row.id),
    code: String(row.code),
    course_id: Number(row.course_id),
    expires_at: row.expires_at ? String(row.expires_at) : null,
    is_used: Boolean(row.is_used),
    slug: String(row.slug),
  };

  if (row.is_used) {
    if (userId && row.used_by === userId) {
      return { codeRow, isUsed: true };
    }
    return { codeRow, isUsed: true };
  }

  return { codeRow, isUsed: false };
}

export async function processUsedCode(
  userId: number,
  codeRow: CodeRow
): Promise<boolean> {
  const existingEnrollment = await getExistingEnrollment(userId);
  if (!existingEnrollment) {
    return false;
  }
  return existingEnrollment.course_id === codeRow.course_id;
}

