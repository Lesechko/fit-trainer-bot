export type UserRow = {
  id: number;
  telegram_id: number;
  start_date: string;
  day: number;
};

export type UserDayRow = Pick<UserRow, 'day'>;

export type WhitelistRow = { telegram_id: number };

export type VideoRow = {
  id: number;
  day: number;
  file_id: string;
  created_at: string;
};

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
};

// (duplicate removed)
