import 'dotenv/config';
import { Pool } from 'pg';

// Use DATABASE_URL only — avoid importing ../db (which pulls in config and BOT_TOKEN)
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

/**
 * Remove a user completely from the database for testing.
 * Deletes: users (cascades to user_courses, lesson_completions).
 * Also unmarks any access codes they used so codes can be reused.
 *
 * Usage:
 *   npm run removeuser -- <telegram_id>     — remove by Telegram ID (e.g. from @userinfobot)
 *   npm run removeuser -- --id <user_id>    — remove by internal users.id
 *
 * After running, the user will appear as new when they /start again.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npm run removeuser -- <telegram_id>');
    console.error('   or: npm run removeuser -- --id <user_id>');
    console.error('');
    console.error('Examples:');
    console.error('  npm run removeuser -- 123456789');
    console.error('  npm run removeuser -- --id 5');
    process.exit(1);
  }

  let userId: number;
  let telegramId: string;

  if (args[0] === '--id') {
    if (!args[1]) {
      console.error('Usage: npm run removeuser -- --id <user_id>');
      process.exit(1);
    }
    const id = parseInt(args[1], 10);
    if (!Number.isFinite(id)) {
      console.error('Invalid user id. Use an integer.');
      process.exit(1);
    }
    const res = await pool.query(
      'SELECT id, telegram_id FROM users WHERE id = $1',
      [id]
    );
    if (res.rows.length === 0) {
      console.error('User not found with id:', id);
      process.exit(1);
    }
    userId = res.rows[0].id as number;
    telegramId = String(res.rows[0].telegram_id ?? '');
  } else {
    const raw = args[0];
    const num = parseInt(raw, 10);
    if (!Number.isFinite(num)) {
      console.error('Invalid telegram_id. Use a number or --id <user_id>');
      process.exit(1);
    }
    const res = await pool.query(
      'SELECT id, telegram_id FROM users WHERE telegram_id = $1',
      [num]
    );
    if (res.rows.length === 0) {
      console.error('User not found with telegram_id:', num);
      process.exit(1);
    }
    userId = res.rows[0].id as number;
    telegramId = String(res.rows[0].telegram_id ?? raw);
  }

  // Unmark access codes used by this user (so codes can be reused for testing)
  const codesRes = await pool.query(
    'UPDATE course_access_codes SET is_used = FALSE, used_by = NULL, used_at = NULL WHERE used_by = $1 RETURNING id',
    [userId]
  );
  const codesFreed = codesRes.rowCount ?? 0;

  // Delete user — CASCADE removes user_courses and lesson_completions.
  // course_access_codes.used_by is SET NULL on user delete; we already cleared it above.
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);

  console.log('✅ User removed successfully.');
  console.log('   Telegram ID:', telegramId, '| Internal ID:', userId);
  if (codesFreed > 0) {
    console.log('   Access codes freed for reuse:', codesFreed);
  }
  console.log('   They will appear as a new user when they /start again.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => {
    void pool.end();
  });
