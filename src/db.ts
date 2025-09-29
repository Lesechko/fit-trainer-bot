import { Pool } from 'pg';
import { ADMIN_ID, DATABASE_URL } from './config';
import { WhitelistRow, UserDayRow, UserRow } from './types';

export const db = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export async function initializeSchema(): Promise<void> {
  try {
    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id INTEGER UNIQUE,
        start_date TEXT,
        day INTEGER DEFAULT 1
      )
    `);

    // Create whitelist table
    await db.query(`
      CREATE TABLE IF NOT EXISTS whitelist (
        telegram_id INTEGER UNIQUE
      )
    `);

    // Add admin to whitelist if specified
    if (ADMIN_ID) {
      await db.query(
        'INSERT INTO whitelist (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING',
        [ADMIN_ID]
      );
    }

    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

export type { WhitelistRow, UserDayRow, UserRow };

