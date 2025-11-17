import { CourseAccessCodeRow } from '../../../types';

export type ExistingCourseRow = {
  title: string;
  course_id: number;
  slug: string;
};

export type CodeRow = Pick<CourseAccessCodeRow, 'id' | 'code' | 'course_id' | 'expires_at' | 'is_used'> & { slug: string };

export type EnrollmentRow = {
  slug: string;
};
