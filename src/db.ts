import { Pool } from 'pg';
import { DATABASE_URL } from './config';
import { UserRow } from './types';

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
        day INTEGER NOT NULL CHECK (day > 0),
        file_id VARCHAR(255) NOT NULL,
        difficulty TEXT, -- VIDEO_DIFFICULTY.EASY, VIDEO_DIFFICULTY.HARD, or NULL for default video
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(course_id, day, difficulty)
      )
    `);

    // Migration: Add difficulty column if it doesn't exist (for existing databases)
    await db.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'course_videos' AND column_name = 'difficulty'
        ) THEN
          -- Add the difficulty column
          ALTER TABLE course_videos ADD COLUMN difficulty TEXT;
        END IF;
      END $$;
    `);

    // Migration: Update unique constraint to include difficulty if needed
    await db.query(`
      DO $$ 
      DECLARE
        constraint_name TEXT;
      BEGIN
        -- Check if difficulty column exists
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'course_videos' AND column_name = 'difficulty'
        ) THEN
          -- Check if we already have a constraint with all three columns
          SELECT conname INTO constraint_name
          FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          WHERE t.relname = 'course_videos'
            AND c.contype = 'u'
            AND (
              SELECT COUNT(DISTINCT a.attname)
              FROM unnest(c.conkey) AS key
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key
              WHERE a.attname IN ('course_id', 'day', 'difficulty')
            ) = 3;
          
          -- If no constraint with all three columns exists, try to add it
          IF constraint_name IS NULL THEN
            BEGIN
              ALTER TABLE course_videos ADD CONSTRAINT course_videos_course_id_day_difficulty_key 
              UNIQUE (course_id, day, difficulty);
            EXCEPTION 
              WHEN duplicate_object THEN
                -- Constraint might already exist with different name, that's okay
                NULL;
              WHEN OTHERS THEN
                -- Any other error, log but don't fail
                RAISE NOTICE 'Could not add unique constraint: %', SQLERRM;
            END;
          END IF;
        END IF;
      END $$;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS user_courses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        start_date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, course_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS course_access_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        is_used BOOLEAN DEFAULT FALSE NOT NULL,
        used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        used_at TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_context (
        telegram_id INTEGER PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS lesson_completions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        day INTEGER NOT NULL CHECK (day > 0),
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, course_id, day)
      )
    `);

    // Essential indexes only - based on actual query patterns
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_courses_course_id ON user_courses(course_id)
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_course_access_codes_code ON course_access_codes(code)
    `);
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug)
    `);

    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

export type { UserRow };
