# Platform Integration Audit — MarGo Telegram Training Bot

- **Bot:** `@MarGoTraining_bot` (`fit-trainer-bot`)
- **Audited commit:** `bf38a0d` (`main`)
- **Platform repo (read-only):** `margo-fit-platform`
- **Date:** 2026-11-17
- **Scope:** Coexistence of one Telegram bot for (1) paid courses in-bot, (2) platform Telegram Login / OIDC identity, (3) platform workout reminders via Bot API `sendMessage`.

---

## Verdict

**Умовний go для спільного бота (courses + Login/OIDC + reminders), але P0 на оплаті курсів блокує «безпечний» реліз курсу з сайту.**

Спільний `@MarGoTraining_bot` технічно сумісний з платформою: long polling у цьому репо + outbound `sendMessage` з платформи + Login Widget/OIDC у BotFather — різні поверхні одного токена/бота. Курси правильно лишаються в боті; deep link `site-<slug>` з `/courses` збігається з хендлером бота. Окремі БД — правильно; зливати не варто.

**Блокер:** `/start paid-<slug>` зараховує на курс **без** перевірки WayForPay (redirect = доказ оплати). На платформі навпаки: webhook авторитетний, success URL — лише UX (`docs/adr/002-member-authentication.md`). Поки bot payment не переведено на verified `serviceUrl`, публічний CTA «Відкрити в Telegram → оплата» з сайту — фінансовий ризик.

**У цьому PR:** лише аудит. Вимикати `paid-` без webhook — ламає поточний UX; «секрет у start-параметрі» — обхідний gate. Правильний фікс — WayForPay webhook + enroll після підпису (окремий task).

---

## Integration map

```
┌──────────────────────────────┐     deep link site-<slug>      ┌──────────────────────────────┐
│ margo-fit-platform           │ ─────────────────────────────► │ fit-trainer-bot              │
│ /courses → t.me/…?start=…    │                                │ Telegraf long polling        │
│                              │     Bot API sendMessage        │ + node-cron daily videos     │
│ TELEGRAM_BOT_TOKEN           │ ─────────────────────────────► │ BOT_TOKEN (same bot)         │
│ reminders / notices          │     (no getUpdates/webhook)    │                              │
│                              │                                │ DB: users, user_courses,…    │
│ Login Widget / OIDC          │ ◄── BotFather Login on same bot│ (окрема від platform DB)     │
│ auth_users.telegram_user_id  │     (не через bot updates)     │                              │
└──────────────────────────────┘                                └──────────────────────────────┘
```

| Concern | Bot | Platform | Shared? |
| --- | --- | --- | --- |
| Course delivery & enrollment | Yes (`src/commands/user/`, `src/cron.ts`) | Marketing pages only (`src/content/telegram-courses.ts`) | Same bot username |
| Member cabinet `/me` | No | Yes | No |
| Identity key | `users.telegram_id` (bot DB) | `auth_users.telegram_user_id` | Same Telegram id space; **no DB join** |
| Payments (courses) | WayForPay button URL + `paid-` redirect | N/A for bot courses | Same merchant possible; **different trust model** |
| Payments (subscription) | N/A | WayForPay + `serviceUrl` webhook | Do not mix enroll paths |
| Reminders | Course cron in-process | `src/infra/telegram/send-member-telegram.ts` | Same `BOT_TOKEN` / `TELEGRAM_BOT_TOKEN` |
| Login / OIDC | Passive (BotFather domain) | Active (`docs/26-Telegram-OIDC-Login.md`) | Same bot in BotFather |

**Hard rule for ops:** платформа **ніколи** не викликає `setWebhook` на цей бот. Long polling (`bot.launch()` у `src/index.ts`) і webhook взаємовиключні. Зараз платформа лише `sendMessage` — OK.

---

## Deep-link table

| Start payload | Source | Bot handler | Effect | Trust |
| --- | --- | --- | --- | --- |
| *(none)* `/start` | Manual open, platform «увімкни нагадування» (`https://t.me/MarGoTraining_bot` без payload) | `startCommandCallback` → `START_ASK_CODE` | Просить код доступу | UX: member може плутатися з курсом |
| `site-<slug>` | Platform `/courses`, old landing `VITE_TELEGRAM_BOT_URL`, marketing | `handleSiteUser` (`src/commands/user/utils/siteVisitor.ts`) | Greeting + кнопка на `PAYMENT_URL` | Safe (не enroll) |
| `paid-<slug>` | WayForPay return / будь-хто з посиланням | `handlePaymentCompletion` (`src/commands/user/utils/paymentCompletion.ts`) | **Auto-enroll** + access code | **P0 — не довіряти** |
| `instagram-<slug>` | Ads / funnel | `handleInstagramFunnel` | Free video funnel; не курс | OK (продуктово free) |
| `<access_code>` | Admin `/…` links (`src/commands/admin/accessCodes.ts`) | `redeemWithCode` | Enroll якщо код валідний | OK (секрет коду) |

**Platform course CTA (verified in platform content):**

`https://t.me/MarGoTraining_bot?start=site-healthy-joints`

з `telegramCourseBotHref` у `margo-fit-platform/src/content/telegram-courses.ts` — збігається з `healthy-joints` у `src/courses/1_healthy-joints.ts` / `COURSES` у `src/config.ts`.

**Platform reminder buttons:** ведуть на `APP_PUBLIC_URL/me/login?next=/me/week?date=…` (`memberNoticeUrl`), не на bot start payload. Бот лише доставлений транспорт повідомлення.

**Старий лендінг:** `joints_cource_app` → той самий `site-healthy-joints`.

---

## Risks

### P0

1. **`paid-<slug>` enroll без verification**  
   - Код: `src/commands/user/utils/paymentCompletion.ts` + пріоритет у `src/commands/user/enrollment.ts`.  
   - Будь-хто відкриває `https://t.me/MarGoTraining_bot?start=paid-healthy-joints` → `createAccessCodeForPayment` + `enrollUserInCourse(..., 'paid')`.  
   - Немає HTTP-сервера / WayForPay `serviceUrl` / підпису merchant.  
   - Контраст з платформою: «Checkout redirects are never proof of payment» (`docs/adr/002-member-authentication.md`).  
   - **Mitigation (правильний):** pending order + verified webhook → enroll → optional `sendMessage`. Return URL — «дякуємо, доступ активується» (UX only).  
   - **Не робити:** «секрет» у publicly guessable start param; client-only flags.

### P1

1. **Один bot token на курси + reminders + (legacy) Login HMAC**  
   Витік `BOT_TOKEN` / `TELEGRAM_BOT_TOKEN` = контроль чатів учасників курсів і member notices. Окремі secrets rotation runbooks; не логувати token (`send-member-telegram.ts` уже уникає логів chat/text/token).

2. **Конфлікт getUpdates vs webhook**  
   Якщо хтось увімкне Telegram webhook для «payment bot API» на цей же бот — long polling курсу впаде. Документувати в ops; webhook для оплати має бути **HTTPS на ваш бекенд**, не Telegram webhook.

3. **`/start` без параметра = «введіть код»**  
   Member, який відкриває бота лише для дозволу нагадувань, бачить курсний онбординг. Платформа лінкує голий `t.me/MarGoTraining_bot`. Рекомендація: окремий payload на кшталт `start=member` → коротке «Бот підключено; нагадування прийдуть сюди» (без enroll).

4. **Немає публічного HTTP у боті**  
   `package.json` — лише Telegraf + cron + pg. WayForPay webhook потребує нового inbound HTTP (окремий сервіс / platform endpoint / thin sidecar), не «ще один callback у Telegraf».

5. **Глобальний `PAYMENT_URL`**  
   `env.example` / `process.env.PAYMENT_URL` на курс — другий курс легко отримає ту саму кнопку / той самий return `paid-…` у кабінеті WayForPay. Per-course merchant buttons або programmatic invoice.

6. **Копірайт платформи vs реальність**  
   Steps: «Оплата проходить просто в боті» — фактично зовнішній WayForPay URL з кнопки. Узгодити текст після фіксу payment trust.

### P2

1. **Окремі БД без лінку** — той самий Telegram id може бути course student і platform member без спільного профілю. OK для MVP; не мержити схеми поспіхом. Майбутнє: optional cross-ref by telegram id, не shared tables.
2. **`setTimeout` follow-ups Instagram** (`scheduleDelayedMessage`) — губляться на рестарті процесу.
3. **`BOT_USERNAME` optional** — `getPaymentRedirectUrl` кидає, якщо порожній; site flow не вимагає його для кнопки (URL захардкожений у WayForPay dashboard).
4. **`whitelistGuard`** — фактично no-op для юзерів; admin захист у handlers. Не security boundary.
5. **Масштаб курсів** — патерн `src/courses/<n>_<slug>.ts` + JSON messages + реєстр у `src/config.ts` уже multi-course ready; sync slug з `margo-fit-platform/src/content/telegram-courses.ts` вручну.
6. **Instagram `entry_source` sticky** — повторний `/start instagram-…` мовчить; OK, але важко «перезапустити» воронку без admin.

---

## Safe payment flow (target)

Дзеркалити платформенний WayForPay path (`process-wayforpay-callback`, ADR-002):

1. **Intent:** user натискає «Оплатити» → бот або thin API створює `payment_orders` (pending) з `telegram_user_id`, `course_slug`, amount, unique orderReference.
2. **Checkout:** redirect / WayForPay button прив’язаний до цього order (не анонімний shared button без order id, якщо можливо).
3. **Authority:** WayForPay `serviceUrl` POST → verify merchant signature → idempotent `payment_events` → **тоді** enroll (`enrollUserInCourse` / access code).
4. **UX return:** `?start=paid-<slug>` або `?start=thanks-<slug>` лише повідомляє статус / «якщо оплата пройшла — курс уже тут»; **не** викликає enroll.
5. **Notify:** після webhook — `bot.telegram.sendMessage(telegram_id, …)` з кнопкою «День 1» (як зараз confirmation), навіть якщо user не повернувся з браузера.
6. **Refunds / chargebacks:** admin revoke enrollment (існуючі admin user tools розширити).

**Interim (операційний, без коду-хака):** продавати через admin access codes; не поширювати `paid-` посилання публічно; моніторити раптові `entry_source='paid'` enrollments.

---

## Architecture recommendations (більше курсів + dual role)

1. **Залишити курси в боті** — не переносити в `/me`. Platform `/courses` = вітрина + deep link.
2. **Один бот — OK**, якщо ролі чітко розділені в `/start` router:
   - `site-*` / course codes / (future) payment thanks
   - `member` / bare start → soft landing для cabinet reminders
   - ніколи не змішувати platform subscription entitlement з bot `user_courses`
3. **Course pack pattern (вже є):** новий курс = messages JSON + config ts + `COURSES.push` + DB row + platform `telegramCoursesContent.courses[]` з тим самим `botSlug`. Чеклист у README доповнити platform sync.
4. **Payment sidecar:** або (A) мінімальний HTTPS у bot deploy (Railway), або (B) platform route `POST /api/payments/wayforpay/bot-course-callback` що після verify викликає internal enroll API / admin queue — **не** shared DB. Перевага B: уже є WayForPay verify на платформі. Перевага A: bot лишається owner enrollment.
5. **Не merge DB.** Якщо потрібен unified CRM — read model / sync by `telegram_user_id`, окремий job.
6. **OIDC cutover** (`docs/26-Telegram-OIDC-Login.md`): BotFather Login на цьому боті; irreversible vs legacy widget. Координувати з platform release; на курсний long polling не впливає.
7. **Observability:** окремі metrics «course daily send» vs «platform notice send»; алерт якщо bot process down (курсні відео зупиняються; platform reminders можуть ще йти).

---

## Pre-release checklist

### Перед публічним `/courses` CTA з оплатою

- [ ] P0: `paid-*` більше не enroll’ить без verified WayForPay event
- [ ] Webhook endpoint live + signature tests + idempotency
- [ ] Return URL у WayForPay = UX only; перевірити вручну «відкрив paid- без оплати» → **немає** доступу
- [ ] Per-course payment button / order reference для `healthy-joints`
- [ ] Admin шлях: access code як backup
- [ ] Sync slug: bot `healthy-joints` ↔ platform `botSlug`
- [ ] Smoke: `site-healthy-joints` → greeting + payment button (не enroll)

### Спільний бот + platform reminders + Login

- [ ] Той самий bot username у platform env (`getPublicTelegramBotUsername`) і `BOT_USERNAME`
- [ ] `TELEGRAM_BOT_TOKEN` (platform) == `BOT_TOKEN` (bot) — один секрет, два env store
- [ ] Підтверджено: **немає** `setWebhook` на цьому боті з platform/CI
- [ ] Member open bot: прийнятний UX (або `start=member` landing)
- [ ] OIDC/Login Allowed URLs = production platform origin only
- [ ] Reminder `sendMessage` smoke з admin planning; кнопка веде на `/me/login?next=…`
- [ ] Bot restart не вбиває platform notices (очікувано незалежні)

### Multi-course ready

- [ ] README + цей doc: кроки додавання курсу в обох репо
- [ ] Окремий WayForPay product/button на курс
- [ ] Instagram funnel slug ≠ випадковий overlap з `paid-` / `site-` prefixes (`extractCourseSlug` — longest prefix order already: paid → site → instagram)

### Не робити перед релізом

- [ ] Не переносити курс у web cabinet
- [ ] Не зливати Postgres bot ↔ platform
- [ ] Не додавати «обхідні» payment gates на клієнті / у start param

---

## Platform follow-ups (поза цим репо)

1. Після bot webhook/enroll fix — підкрутити copy в `src/content/telegram-courses.ts` (кроки оплати).
2. Опційний deep link `?start=member` з `loadTelegramReminderHref` замість голого `t.me/…`.
3. Якщо обираєте payment verify на platform: новий callback + out-of-band notify bot (signed internal call), без shared DB.
4. Документувати в platform ops: never `setWebhook` on `@MarGoTraining_bot`.
5. Тримати `TELEGRAM_COURSE_BOT` / public username в sync з BotFather.

---

## Code anchors

| Topic | Path |
| --- | --- |
| Start router | `src/commands/user/enrollment.ts` |
| Paid enroll (P0) | `src/commands/user/utils/paymentCompletion.ts` |
| Site greeting | `src/commands/user/utils/siteVisitor.ts` |
| Instagram funnel | `src/commands/user/utils/instagramFunnel.ts` |
| Course registry | `src/config.ts`, `src/courses/1_healthy-joints.ts` |
| Cron / daily | `src/cron.ts` |
| Process entry | `src/index.ts` |
| Historical site flow doc | `SITE_USER_FLOW.md` (описує insecure redirect-as-proof — застарілий trust model) |
| Platform deep links | `margo-fit-platform/src/content/telegram-courses.ts` |
| Platform send | `margo-fit-platform/src/infra/telegram/send-member-telegram.ts` |
| Platform auth ADR | `margo-fit-platform/docs/adr/002-member-authentication.md` |

---

## Decision log (this audit)

| Option | Result |
| --- | --- |
| Fix P0 in this branch by disabling `paid-` enroll | Rejected — breaks current WayForPay return without replacement |
| Fix P0 with secret-in-URL / soft gate | Rejected — bypassable; violates constraint |
| Implement full WayForPay webhook here | Out of scope for smallest safe change; needs HTTP + merchant secrets + product UX |
| Ship audit on `docs/platform-integration-audit` | **Done** |
