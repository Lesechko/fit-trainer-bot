export type UserRow = {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  start_date: string;
  day: number;
  created_at: string;
  updated_at: string;
};

export type UserDayRow = Pick<UserRow, 'day'>;

// Multi-course types
export type CourseRow = {
  id: number;
  slug: string;
  title: string;
  is_active: boolean;
  created_at: string;
};

export type CourseVideoRow = {
  id: number;
  course_id: number;
  day: number;
  file_id: string;
  created_at: string;
};

export type UserCourseRow = {
  id: number;
  user_id: number; // refers to users.id
  course_id: number; // refers to courses.id
  start_date: string;
  created_at: string;
};

export type CourseAccessCodeRow = {
  id: number;
  code: string;
  course_id: number;
  created_by: number | null;
  created_at: string;
  expires_at: string | null;
  is_used: boolean;
  used_by: number | null;
  used_at: string | null;
};

export type AdminContextRow = {
  telegram_id: number;
  course_id: number | null;
  created_at: string;
  updated_at: string;
};

export type LessonCompletionRow = {
  id: number;
  user_id: number;
  course_id: number;
  day: number;
  completed_at: string;
};

// Static config for hardcoded courses in code
export type CourseStaticConfig = {
  slug: string;
  title: string;
  days: number;
  welcome: string;
  // Time in HH:MM (24h) to send daily course video in TIMEZONE
  dailyTime?: string; // default '09:00' if not set
  motivation?: {
    time: string; // '09:00' in TIMEZONE
    messages: string[];
  };
  // Video titles for each day (index 0 = day 1, etc.) - sent as video caption
  videoTitles?: string[];
  // Detailed descriptions for each day's video (index 0 = day 1, etc.) - sent as separate message
  videoDescriptions?: string[];
};

// (duplicate removed)
