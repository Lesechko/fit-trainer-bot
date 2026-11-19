# Bot Structure Audit — MarGo Telegram Training Bot

- **Bot:** `@MarGoTraining_bot` (`fit-trainer-bot`)
- **Branch base:** `origin/feat/telegram-member-start` (`ed63e82` — `/start member` soft landing ще **не** в `origin/main`)
- **Platform (read-only):** `margo-fit-platform` → `docs/29-Telegram-Bot-Ops.md`
- **Попередній інтеграційний аудит:** гілка `docs/platform-integration-audit` → `docs/platform-integration-audit.md`
- **Дата:** 2026-11-19
- **Scope:** структура й логіка бота + безпечний поведінково-еквівалентний рефактор (без payment webhook / DB merge / setWebhook)

---

## Verdict

Бот зрозумілий як **три ролі одного токена**: курси (long polling тут), Login/OIDC (пасивно), platform reminders (`sendMessage` з платформи). `/start` уже розведений через `resolveStartRoute`; enroll paths для code/paid ділять спільні helpers. Активних учасниць «у процесі» немає — хороший момент для гігієни.

**P0 trust (відомо, не латати в цій гілці):** `/start paid-<slug>` зараховує без WayForPay verify.

**У цій гілці зроблено:** цей звіт + невеликий P1-рефактор (dead helpers, unify access-code gen / `BOT_USERNAME`, `getCallbackData`, unit tests, README module map). Поведінка deep links / enroll / cron збережена.

---

## 1. Карта модулів

```
src/index.ts          boot: schema → migrations → Telegraf → commands → cron
src/config.ts         BOT_TOKEN, ADMIN_ID, TIMEZONE, DATABASE_URL, BOT_USERNAME, COURSES[]
src/middleware.ts     whitelistGuard (фактично pass-through для всіх)
src/commands.ts       registerCommands — єдина реєстрація handlers
src/messages.ts       UA copy (god-file ~250 LOC)
src/types.ts          UserRow, Course*, Code*, CourseStaticConfig, …
src/db.ts             Pool + CREATE TABLE IF NOT EXISTS + inline video_type migrate
src/db/migrations.ts  named idempotent migrations (entry_source)
src/cron.ts           node-cron: daily videos + motivation per course
src/courses/          static course registry (healthy-joints + JSON messages)
src/services/         video / course day math / lessons / admin notify
src/commands/user/    start/redeem + lesson/difficulty/review/custom + utils/
src/commands/admin/   access codes, courses, users list/remove/sendday
src/commands/videos.ts  admin video CRUD / broadcast
src/commands/misc.ts  /senddaily
```

| Модуль | Роль | Ключові символи |
| --- | --- | --- |
| `index.ts` | lifecycle | `startBot`, SIGINT/SIGTERM → `bot.stop` (cron **не** stop) |
| `commands.ts` | wiring | `registerCommands` |
| `commands/user/enrollment.ts` | `/start`, `/redeem`, тонкі callback wrappers | `startCommandCallback`, `redeemWithCode` |
| `commands/user/utils/startRoute.ts` | pure router | `resolveStartRoute`, `StartRoute` |
| `…/paymentCompletion.ts` | `paid-` enroll | `handlePaymentCompletion` ⚠️ no pay verify |
| `…/siteVisitor.ts` | `site-` greeting | `handleSiteUser` |
| `…/instagramFunnel.ts` | IG funnel + `setTimeout` | `handleInstagramFunnel` |
| `…/enrollmentUtils.ts` | shared enroll | `enrollUserInCourse`, `handleExistingEnrollment` |
| `…/codeUtils.ts` | codes | `validateAndLoadCode`, `generateAccessCode` |
| `…/enrollmentHelpers.ts` | helpers | `getCommandParam`, `getCourseFromDb`, `createAccessCodeForPayment`, `parseDelayToMs`, `getPaymentRedirectUrl` |
| `cron.ts` + `videoService.ts` | daily delivery | `scheduleDaily`, `sendDailyVideos` |
| `courseService.ts` | day math | `calculateProgramDay`, `calculateUserProgress`, `getEnrollmentStartDateForCourse` |

**Hard rule:** `setWebhook` у репо **немає**. Long polling через `bot.launch()`.

---

## 2. User flows

### `/start` router

`startCommandCallback` → `resolveStartRoute(getCommandParam(ctx))`:

| Payload | `kind` | Ефект |
| --- | --- | --- |
| *(empty)* | `ask_code` | `START_ASK_CODE` |
| `member` | `member` | `START_MEMBER_CONNECTED` (без enroll) |
| `paid-<slug>` | `paid` | auto-enroll + synthetic access code |
| `site-<slug>` | `site` | greeting + `PAYMENT_URL` button (без enroll) |
| `instagram-<slug>` | `instagram` | free funnel messages |
| інше | `access_code` | `redeemWithCode` |

Неповні префікси (`site-`, `paid-`) → `access_code` (покрито тестами).

### Enroll

1. **Access code** — `/start <code>` або `/redeem <code>` → validate → existing-enrollment dialog → `enrollUserInCourse(..., 'code')` → welcome + `start_day_1_*`.
2. **paid-** — той самий enroll pipeline з `entry_source='paid'`; код створюється через `createAccessCodeForPayment`. **Немає** підпису/webhook WayForPay.
3. **site-** — лише UX до оплати.
4. **Admin `/genaccess`** — код у DB + deep link `t.me/{BOT_USERNAME}?start={code}`.

### Lessons / day progression

- `user_courses.start_date` = сьогодні в `TIMEZONE` при enroll.
- Day 1 часто `autoSend: false` → кнопка `start_day_1_*`.
- Cron / `/senddaily` → `sendDailyVideos`: SQL day = `FLOOR((CURRENT_DATE - start_date) + 1)`; difficultyChoice → UI; інакше відео; після останнього дня — review form якщо є.

### Difficulty / review / Instagram / admin

- Difficulty: callback `difficulty_{courseId}_{day}_{easy|hard}` → reference video ids з config.
- Review: `review_completed_{courseId}` → bonus video; **без** DB flag (повторний клік можливий, поки кнопка жива).
- Instagram: follow-ups через **in-process `setTimeout`** — губляться на restart/deploy.
- Admin: courses context, list/remove/delete users, sendday, videos, genaccess.

---

## 3. Data model

| Table | Ключові поля |
| --- | --- |
| `users` | `telegram_id BIGINT UNIQUE`, names, `entry_source`, timestamps |
| `courses` | `slug UNIQUE`, `title`, `is_active` |
| `course_videos` | `(course_id, day, video_type)` UNIQUE; `daily` \| `reference` |
| `user_courses` | `(user_id, course_id)` UNIQUE, `start_date` TEXT |
| `course_access_codes` | `code`, `expires_at`, `is_used`, `used_by` |
| `admin_context` | `telegram_id` → `course_id` |
| `lesson_completions` | `(user_id, course_id, day)` UNIQUE |

**Дублювання логіки:**

- Day number: SQL у cron/videoService vs `calculateProgramDay` (UTC) vs `calculateUserProgress` (local `Date`) — **три формули**.
- Access code generation: було inline у `/genaccess` + `generateAccessCode` (у цій гілці уніфіковано).
- Description + complete/custom buttons: `videoService.sendDayVideoToUser` ≈ `difficultyChoiceCallback`.
- Restart cleanup: `cleanupCompletedCourse` ≈ частини `handleRestartCourse`.
- `entry_source`: ставиться на INSERT; ON CONFLICT у `ensureUserExists` **не** оновлює; окремо `updateEntrySourceOnEnrollment` (instagram → paid/code).

Окрема БД від платформи — правильно; зливати не варто.

---

## 4. Болі / smell’и

### Товсті handlers vs thin utils

- **Добре:** `/start` switch + `startRoute`; `siteVisitor`; `paymentCompletion`.
- **Товсті:** `callbackUtils.ts`, `difficultyChoice.ts`, `customButtons.ts`, admin `enrolled.ts` / `siteUsers.ts`, `videoService.sendDailyVideos`.

### Дублювання extractCourseSlug / enrollment

- `extractCourseSlug` — **мертвий** після `resolveStartRoute` (видалено в цій гілці).
- `scheduleDelayedMessage` / `scheduleFlexibleMessage` — мертві обгортки навколо `setTimeout` (прибрано / позначено).
- Paid і code шляхи коректно ділять `handleExistingEnrollment` + `enrollUserInCourse`.

### God-files

| Файл | ~LOC | Нотатка |
| --- | --- | --- |
| `messages.ts` | 250 | усі UA strings; секції вже є — механічний split = P1 later |
| `db.ts` | 233 | pool + schema + inline migrate |
| `enrollment.ts` | 228 | façade + повторюваний callback parsing (полегшено через `getCallbackData`) |
| `videoService.ts` | 284 | |
| `callbackUtils.ts` | 259 | |
| `enrolled.ts` | 307 | |

### Слабкі типи / `any`

Багато `(ctx.callbackQuery as any)`, `db.query` → `any`, `Telegraf<any>` у message helpers. Не блокує runtime, ускладнює рефактор.

### Cron + process lifecycle

- Cron tasks **не** stop на SIGINT/SIGTERM.
- Instagram / flexible follow-ups: лише `setTimeout` → **втрата на restart**.
- `bot` оголошується після `startBot()` call site — працює, але крихке впорядкування.

### Тести

До цієї гілки майже лише `startRoute.test.ts`. Додано focused tests на delay parse / payment redirect URL / access-code generator.

### Config / env

- `PAYMENT_URL` — global env → `healthyJoints.siteVisitor.paymentUrl` (не per-course multi-payment).
- `BOT_USERNAME` у `config.ts`; `/genaccess` раніше читав `process.env` напряму (виправлено).
- `env.example` не містив `BOT_USERNAME` (додано).

### P0 payment trust (відомо)

`handlePaymentCompletion` enroll’ить будь-кого з лінком `paid-<slug>`. Повноцінний фікс = WayForPay `serviceUrl` webhook + pending order — **окрема задача**. Не «секрет у start-параметрі».

---

## 5. Рекомендації

### P0 — correctness / data loss / silent break

| # | Що | Статус |
| --- | --- | --- |
| 1 | `paid-` без payment verify | **Відомо / відкладено** (окремий task) |
| 2 | Instagram `setTimeout` губиться на deploy | Документовано; durable jobs = окреме рішення (змінює поведінку після restart) |
| 3 | Ніколи `setWebhook` на цього бота | Дотримуватись (`docs/29-Telegram-Bot-Ops.md`) |

### P1 — варто зараз (немає активних in-progress юзерів)

| # | Що | У цій гілці? |
| --- | --- | --- |
| 1 | Прибрати dead helpers (`extractCourseSlug`, unused schedulers) | ✅ |
| 2 | Unifyментувати `/genaccess` → `generateAccessCode` + `config.BOT_USERNAME` | ✅ |
| 3 | `getCallbackData` замість copy-paste у enrollment callbacks | ✅ |
| 4 | Unit tests на pure helpers (router вже є; delay / URL / code) | ✅ |
| 5 | README: карта модулів + «як додати курс» | ✅ (курс уже був; додано module map) |
| 6 | Звести day-math до однієї TZ-aware формули + golden tests | ❌ later (ризик silent day shift) |
| 7 | Механічний split `messages.ts` / `db.ts` з re-export barrel | ❌ later (шумний diff) |
| 8 | Stop cron on shutdown | ❌ later (малий win) |

### P2 — later

- WayForPay webhook + enroll після підпису; multi-course `PAYMENT_URL`.
- Observability (structured logs, enroll metrics).
- Сильні типи замість `any` на `db.query` / callbacks.
- Migration version table.
- Спільний builder description+buttons для daily vs difficulty.
- Durable Instagram follow-ups (DB jobs / queue).

---

## 6. Що НЕ чіпати зараз

- Payment webhook / WayForPay `serviceUrl` / «секрет у `paid-`»
- Злиття DB з platform
- Перенесення курсів у `/me` / web cabinet
- Breaking rename start payload’ів (`site-`, `paid-`, `instagram-`, `member`, access codes)
- `setWebhook` / новий HTTP server у цьому процесі
- Зміна BotFather token / username
- Ukrainian copy без явної UX-причини
- Course content / video IDs / Instagram delay значення
- Схема DB без міграції + rollback note
- Поведінка `ensureUserExists` ON CONFLICT щодо `entry_source`

---

## 7. Зміни в цій гілці (рефактор)

**Тема 1 — гігієна start/enroll helpers**

- Видалено мертві `extractCourseSlug`, `scheduleDelayedMessage`, `scheduleFlexibleMessage`.
- `/genaccess` використовує `generateAccessCode()` і `BOT_USERNAME` з `config`.
- Спільний `getCallbackData(ctx)` для restart / day1 / Instagram callbacks.
- Явний TODO-коментар у `paymentCompletion.ts` про P0 trust.
- `env.example`: `BOT_USERNAME`.

**Тема 2 — тести + README**

- Тести: `parseDelayToMs`, `getPaymentRedirectUrl`, `generateAccessCode`.
- `package.json` `test` запускає всі `*.test.js` у utils.
- README: актуальна карта `src/` модулів.

Поведінка deep links / enroll / cron — без змін за задумом.

---

## 8. Manual checklist

- [ ] `/start` → ask code (`START_ASK_CODE`)
- [ ] `/start member` → soft landing (`START_MEMBER_CONNECTED`)
- [ ] `/start site-healthy-joints` → site greeting (+ кнопка якщо є `PAYMENT_URL`)
- [ ] Access code enroll path (код / тести `startRoute` + redeem helpers)
- [ ] Cron entrypoint: `scheduleDaily(bot)` у `index.ts` після `registerCommands`
- [ ] `/genaccess` генерує код і (за наявності `BOT_USERNAME`) deep link
- [ ] Немає викликів `setWebhook`

### Автоперевірка (прогнано 2026-11-19)

- `npm run build` — ✅ OK
- `npm test` — ✅ OK (12 tests / 5 suites)
- `npm run lint` — ❌ падає на **старому боргу** (~130 errors: `no-unsafe-*`, `any`, floating promises у `index.ts` тощо). У цій гілці не роздували scope. `*.test.ts` додано в `.eslintignore` (той самий false-positive `describe`/`it`, що й у старому `startRoute.test.ts`).

---

## 9. Git note

- Гілка: `refactor/bot-structure-audit` від `origin/feat/telegram-member-start` (бо `member` ще не в `main`).
- Commit / push / PR — **лише за запитом**.
- Без `Co-authored-by`.
