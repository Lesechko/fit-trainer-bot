import { Pool } from 'pg';
import { DATABASE_URL } from './config';
import { UserDayRow, UserRow } from './types';

export const db = new Pool({
  connectionString: DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

export async function initializeSchema(): Promise<void> {
  try {
    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id INTEGER UNIQUE,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        language_code TEXT,
        start_date TEXT,
        day INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);


    // --- Multi-course schema ---
    await db.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS course_videos (
        id SERIAL PRIMARY KEY,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        day INTEGER NOT NULL,
        file_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(course_id, day)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS user_courses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        start_date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, course_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS course_access_codes (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        is_used BOOLEAN DEFAULT FALSE,
        used_by INTEGER,
        used_at TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_context (
        telegram_id INTEGER PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS lesson_completions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        day INTEGER NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, course_id, day)
      )
    `);

    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

export type { UserDayRow, UserRow };
