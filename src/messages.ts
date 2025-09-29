// User-facing messages (UA)

// Access / Auth
export const ACCESS_ERROR = '⚠️ Виникла помилка доступу';
export const ACCESS_DENIED = '🚫 Доступ заборонений';
export const ADMIN_ONLY_ADD = '🚫 Тільки адмін може додавати користувачів';
export const ADMIN_ONLY_LIST = '🚫 Тільки адмін має доступ';

// Onboarding
export const USER_SAVE_ERROR = '⚠️ Помилка при збереженні користувача';
export const START_OK = `Привіт! 💙  
Мене звати Марго, і я буду супроводжувати тебе протягом наступних 10 днів у нашій програмі вправ для суглобів.  

Щодня ти отримуватимеш нове відео з простими, але дуже корисними вправами. Вони допоможуть зробити твої суглоби більш рухливими, зняти напруження та відчути легкість у тілі.  

📌 Формат програми:
- тривалість: 10 днів  
- щодня — одне коротке відео з вправами  
- все можна робити в зручному темпі вдома, без спеціального обладнання  

Я рада, що ти приєднався до цієї подорожі!  
Будь уважним до свого тіла, виконуй вправи регулярно, і результат обов’язково прийде.  

До зустрічі у першому відео! 🌸`;

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
export const usersList = (list: string) => `👥 Користувачі та їх прогрес:\n${list}`;
