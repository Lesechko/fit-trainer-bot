export type MessageButton = {
  text: string;
  url?: string;
  callback_data?: string;
};

export type Message = {
  text: string;
  buttons?: MessageButton[];
  delay: string;
};

export type UserRow = {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  entry_source: string | null; // 'instagram', 'site', 'code', 'paid', etc.
  created_at: string;
  updated_at: string;
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
  video_type: 'daily' | 'reference';
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

export type EnrolledUserRow = {
  telegram_id: number;
  start_date: string;
};

export type EnrolledUserWithDayRow = EnrolledUserRow & {
  current_day: number;
};

// Custom button action types
export type CustomButtonAction =
  | { type: 'video'; videoFileId: string; message?: string } // Send an extra video
  | { type: 'message'; text: string } // Send a text message
  | { type: 'url'; url: string } // Open a URL (Telegram will handle this)

// Custom button configuration
export type CustomButton = {
  id: string; // Unique identifier for this button (used in callback_data)
  text: string; // Button label
  action: CustomButtonAction; // What happens when button is clicked
  oneTime?: boolean; // If true, button disappears after first use (default: false)
};

// Difficulty choice configuration (asks user before sending video)
export type DifficultyChoice = {
  message: string; // Message to ask user (e.g., "Який рівень складності обираєш?")
  easyButtonText?: string; // Text for easy button (default: "Легший")
  hardButtonText?: string; // Text for hard button (default: "Складніший")
  easyVideoId: number; // Database video ID (from course_videos table) for easy version
  hardVideoId: number; // Database video ID (from course_videos table) for hard version
};

// Day-specific configuration
export type CourseDayConfig = {
  day: number; // 1-based day number
  videoTitle: string; // Title sent as video caption
  videoDescription?: string; // Detailed description sent separately
  motivationMessage?: string; // Day-specific motivation message (optional)
  autoSend?: boolean; // Whether to auto-send this day via scheduled job (default: true). Set to false for manual sends (e.g., day 1 via button)
  customButtons?: CustomButton[]; // Custom buttons for this day (e.g., extra video, resources, etc.)
  difficultyChoice?: DifficultyChoice; // If set, asks user to choose difficulty before sending video (requires easyVideoFileId and hardVideoFileId)

  // Future extensibility examples:
  // dailyTime?: string; // Override course default for this day
  // additionalContent?: string[]; // Extra messages for this day
  // quiz?: { question: string; options: string[]; correct: number };
  // resources?: { title: string; url: string }[];
  // prerequisites?: number[]; // Days that must be completed first
};


// Static config for hardcoded courses in code
export type CourseStaticConfig = {
  slug: string;
  title: string;
  welcome: string;

  // Scheduling
  dailyTime?: string; // Default time for all days (HH:MM format). If not set, course is ignored by daily scheduler

  // Motivation messages
  motivation?: {
    time: string; // When to send motivation (HH:MM format)
    defaultMessages?: string[]; // Fallback messages if day doesn't have one
  };

  // Features
  trackLessonCompletion?: boolean; // Whether to track lesson completion (shows "Виконано!" button, tracks progress). Default: true. Set to false to disable this feature

  // Review and bonus
  reviewFormUrl?: string; // Google form URL for course review (sent after course completion)
  bonusVideoId?: number; // Database video ID (from course_videos table) for bonus video after review completion

  // Site visitors (users who come via site_slug deep link)
  siteVisitor?: {
    greeting: string; // Greeting message for users from website
    paymentUrl: string; // URL to payment service
    paymentButtonText?: string; // Button text (default: "💳 Оплатити курс")
  };

  // Instagram funnel (users who come via instagram-funnelname deep link)
  instagramFunnel?: {
    initialMessage: string; // Initial message text
    initialButton?: MessageButton;
    videoId: number; // Database video ID (from course_videos table)
    followUpMessages?: Array<{
      messageId: string; // Reference to a message in instagramMessages (JSON)
      delay: string; // Time delay after initial message (e.g., "20min", "2h", "1d")
    }>;
  };

  // Day-specific configuration
  days: CourseDayConfig[]; // All day data grouped together
};

// (duplicate removed)
