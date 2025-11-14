// User-facing messages (UA)

// Access / Auth
export const ACCESS_ERROR = '⚠️ Виникла помилка доступу';
export const ACCESS_DENIED = '🚫 Доступ заборонений';
export const ADMIN_ONLY_ADD = '🚫 Тільки адмін може додавати користувачів';
export const ADMIN_ONLY_LIST = '🚫 Тільки адмін має доступ';

// Onboarding
export const USER_SAVE_ERROR = '⚠️ Помилка при збереженні користувача';

// Day/Training
export const NOT_REGISTERED = '⚠️ Ви ще не зареєстровані. Використайте /start';
export const PROGRAM_COMPLETED = '✅ Ви пройшли всю програму!';
export const dayCaption = (day: number) => `🎥 День ${day}`;

// Admin commands
export const ADDUSER_USAGE = '⚠️ Використай так: /adduser 123456789';
export const ADDUSER_BAD_ID = '⚠️ Некоректний ID користувача';
export const ADDUSER_ERROR = '⚠️ Помилка при додаванні користувача';
export const addUserOk = (id: number) =>
  `✅ Користувача ${id} додано в whitelist`;

export const LIST_ERROR = '⚠️ Помилка при отриманні списку';
export const LIST_EMPTY = '📂 Whitelist порожній';
export const listUsers = (list: string) => `📋 Whitelist:\n${list}`;

// Media upload
export const VIDEO_RECEIVED = '✅ Отримав file_id, перевір консоль';

// Admin commands
export const SEND_DAILY_START = '⏰ Надсилаю щоденні відео...';
export const SEND_DAILY_COMPLETE = '✅ Щоденні відео надіслано';
export const SEND_DAILY_ERROR = '⚠️ Помилка при надсиланні щоденніх відео';

export const USERS_ERROR = '⚠️ Помилка при отриманні списку користувачів';
export const USERS_EMPTY = '📂 Немає зареєстрованих користувачів';
export const usersList = (list: string) =>
  `👥 Користувачі та їх прогрес:\n${list}`;

// Video management
export const ADDVIDEO_USAGE = '⚠️ Використай так: /addvideo <день> <file_id>';
export const ADDVIDEO_BAD_DAY = '⚠️ Некоректний номер дня (1-10)';
export const ADDVIDEO_ERROR = '⚠️ Помилка при додаванні відео';
export const ADDVIDEO_SUCCESS = (day: number) =>
  `✅ Відео для дня ${day} додано до поточного курсу`;
export const ADDVIDEO_EXISTS = (day: number) =>
  `⚠️ Відео для дня ${day} вже існує в поточному курсі`;

export const LISTVIDEOS_ERROR = '⚠️ Помилка при отриманні списку відео';
export const LISTVIDEOS_EMPTY = '📂 Немає доданих відео для поточного курсу';
export const listVideos = (list: string) =>
  `🎥 Відео в поточному курсі:\n${list}`;

export const DELVIDEO_USAGE = '⚠️ Використай так: /delvideo <день>';
export const DELVIDEO_ERROR = '⚠️ Помилка при видаленні відео';
export const DELVIDEO_SUCCESS = (day: number) =>
  `✅ Відео для дня ${day} видалено з поточного курсу`;
export const DELVIDEO_NOT_FOUND = (day: number) =>
  `⚠️ Відео для дня ${day} не знайдено в поточному курсі`;

// Broadcast
export const SENDVIDEO_USAGE = '⚠️ Використай так: /sendvideo <file_id>';
export const SENDVIDEO_START =
  '📣 Надсилаю відео всім користувачам поточного курсу...';
export const SENDVIDEO_DONE = (count: number) =>
  `✅ Відео надіслано ${count} користувачам поточного курсу`;
export const SENDVIDEO_ERROR = '⚠️ Помилка при розсилці відео';

// Admin help
export const ADMIN_COMMANDS_HELP = `🛠️ Команди адміна:

*Управління курсами:*
/courses — список курсів
/setcourse <slug> — встановити поточний курс (контекст адміна)
/context — показати поточний курс
/synccourses — синхронізувати курси з конфігурації

*Управління користувачами:*
/listusers — список користувачів поточного курсу
/removeuser <telegram_id> — видалити користувача з поточного курсу
/sendday <telegram_id> <день> — надіслати відео конкретного дня конкретному користувачу

*Управління відео (для поточного курсу):*
/addvideo <день> <file_id> — додати відео до дня
/listvideos — список відео в поточному курсі
/delvideo <день> — видалити відео для дня
/sendvideo <file_id> — надіслати відео всім користувачам поточного курсу

*Коди доступу:*
/genaccess [expires_days] — згенерувати код доступу для поточного курсу

*Інше:*
/senddaily — надіслати щоденні відео вручну
/helpadmin — показати цю довідку`;

// Access codes
export const GENACCESS_USAGE = '⚠️ Використай: /genaccess [expires_days]';
export const GENACCESS_CREATED = (
  slug: string,
  _code: string,
  expires: string | null
) =>
  `✅ Код доступу створено для курсу ${slug}.${
    expires ? `\nДійсний до: ${expires}` : ''
  }`;
export const GENACCESS_CODE = (code: string) => code;
export const GENACCESS_LINK = (url: string) =>
  `🔗 Посилання для старту: ${url}`;
export const GENACCESS_ERROR = '⚠️ Не вдалося створити код';

export const REDEEM_USAGE = '⚠️ Використай: /redeem <code>';
export const REDEEM_INVALID = '⚠️ Код недійсний або прострочений';
export const REDEEM_USED = '⚠️ Код вже використано';
export const REDEEM_ALREADY_ENROLLED = (courseName: string) =>
  `⚠️ Ти вже зареєстрований на курс "${courseName}". Спочатку заверши поточний курс, щоб почати новий.`;

// Course restart messages
export const COURSE_COMPLETED_RESTART = (courseName: string) =>
  `🎉 Вітаю! Ти завершив курс "${courseName}"!\n\n` +
  `Хочеш пройти курс знову? Це допоможе закріпити результати та покращити здоров'я ще більше! 💪\n\n` +
  `Натисни кнопку нижче, щоб почати курс заново:`;

export const COURSE_IN_PROGRESS_RESTART = (courseName: string, currentDay: number, totalDays: number) =>
  `📚 Ти вже проходиш курс "${courseName}" (день ${currentDay}/${totalDays})\n\n` +
  `Хочеш почати курс заново з першого дня? Поточний прогрес буде скинуто.\n\n` +
  `Натисни кнопку нижче, щоб почати курс заново:`;

export const RESTART_BUTTON_TEXT = '🔄 Почати курс заново';
export const CANCEL_BUTTON_TEXT = '❌ Скасувати';
export const START_DAY_1_BUTTON_TEXT = '🚀 Поїхали!';
export const START_DAY_1_MESSAGE = 'Готовий почати? Натисни кнопку нижче, щоб отримати перше відео! 👇';

export const REDEEM_OK = (slug: string) =>
  `✅ Тебе зараховано на курс: ${slug}!`;

// Remove user
export const REMOVEUSER_USAGE = '⚠️ Використай так: /removeuser <telegram_id>';
export const REMOVEUSER_ERROR = '⚠️ Помилка при видаленні користувача';
export const REMOVEUSER_SUCCESS = (telegramId: number, courseTitle: string) =>
  `✅ Користувач ${telegramId} видалений з курсу "${courseTitle}"`;
export const REMOVEUSER_NOT_FOUND = (telegramId: number) =>
  `⚠️ Користувач ${telegramId} не знайдений у поточному курсі`;

// Send day to user
export const SENDDAY_USAGE = '⚠️ Використай так: /sendday <telegram_id> <день>';
export const SENDDAY_ERROR = '⚠️ Помилка при надсиланні відео';
export const SENDDAY_SUCCESS = (telegramId: number, day: number) =>
  `✅ Відео дня ${day} надіслано користувачу ${telegramId}`;
export const SENDDAY_USER_NOT_FOUND = (telegramId: number) =>
  `⚠️ Користувач ${telegramId} не знайдений у поточному курсі`;
export const SENDDAY_INVALID_DAY = '⚠️ Некоректний номер дня';
export const SENDDAY_VIDEO_NOT_FOUND = (day: number) =>
  `⚠️ Відео для дня ${day} не знайдено в поточному курсі`;

// Start flow
export const START_ASK_CODE =
  '🔑 Надішли, будь ласка, свій код доступу командою /redeem <code> або скористайся посиланням з параметром.';

// Courses (мультикурсова логіка)
export const COURSE_NOT_FOUND = '⚠️ Курс не знайдено';
export const COURSES_EMPTY = '📂 Наразі курсів немає';
export const listCourses = (list: string) => `🎓 Курси:\n${list}`;
export const listCourseSlugs = (list: string) => `🔖 Слаги курсів:\n${list}`;

export const CREATECOURSE_USAGE = '⚠️ Використай: /createcourse <slug> <title>';
export const CREATECOURSE_OK = (slug: string) => `✅ Курс ${slug} створено`;
export const CREATECOURSE_ERROR = '⚠️ Не вдалося створити курс';

export const SETCOURSE_USAGE = '⚠️ Використай: /setcourse <slug>';
export const SETCOURSE_OK = (slug: string) =>
  `✅ Поточний курс встановлено: ${slug}`;

// Sync courses from config
export const SYNC_COURSES_START = '🔄 Синхронізую курси з конфігурації...';
export const SYNC_COURSES_DONE = '✅ Курси синхронізовано';
export const SYNC_COURSES_ERROR = '⚠️ Не вдалося синхронізувати курси';

// Admin context
export const CONTEXT_NOT_SET =
  'ℹ️ Поточний курс не встановлено. Використай /setcourse <slug>';
export const CONTEXT_CURRENT = (slug: string, title: string) =>
  `🧭 Поточний курс: ${slug} — ${title}`;

// Admin notifications
export const NEW_USER_ENROLLMENT_NOTIFICATION = (
  userDisplayName: string,
  telegramId: number,
  courseTitle: string,
  courseSlug: string,
  startDate: string
) =>
  `🎉 Новий учасник курсу!\n\n` +
  `👤 Користувач: ${userDisplayName}\n` +
  `🆔 Telegram ID: ${telegramId}\n` +
  `📚 Курс: ${courseTitle} (${courseSlug})\n` +
  `📅 Дата початку: ${startDate}\n` +
  `⏰ Час реєстрації: ${new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}`;

// Lesson completion
export const LESSON_COMPLETED = (day: number) =>
  `✅ День ${day} завершено! Відмінна робота! 🎉`;
export const COMPLETION_ERROR = '⚠️ Помилка при відмітці завершення уроку.';
export const COMPLETION_BUTTON_TEXT = '💪 Виконано!';
export const COMPLETION_BUTTON_DISABLED_TEXT = '💚 Здоров\'я покращено!';
