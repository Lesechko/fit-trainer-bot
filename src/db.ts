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
        video_type TEXT DEFAULT 'daily' CHECK (video_type IN ('daily', 'reference')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(course_id, day, video_type)
      )
    `);

    // Migration: Migrate from difficulty-based to video_type-based schema
    try {
      // Remove old difficulty column if it exists
      await db.query(`
        DO $$ 
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'course_videos' AND column_name = 'difficulty'
          ) THEN
            ALTER TABLE course_videos DROP COLUMN difficulty;
          END IF;
        END $$;
      `);
      
      // Add video_type column if it doesn't exist (DEFAULT 'daily' will set value for existing rows)
      await db.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'course_videos' AND column_name = 'video_type'
          ) THEN
            ALTER TABLE course_videos ADD COLUMN video_type TEXT DEFAULT 'daily' CHECK (video_type IN ('daily', 'reference'));
          END IF;
        END $$;
      `);
      
      // Update constraints: drop old ones and add new one with video_type
      await db.query(`
        DO $$ 
        BEGIN
          -- Drop old constraints if they exist
          IF EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'course_videos_course_id_day_key'
          ) THEN
            ALTER TABLE course_videos DROP CONSTRAINT course_videos_course_id_day_key;
          END IF;
          IF EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'course_videos_course_id_day_difficulty_key'
          ) THEN
            ALTER TABLE course_videos DROP CONSTRAINT course_videos_course_id_day_difficulty_key;
          END IF;
          
          -- Add new constraint with video_type if it doesn't exist
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'course_videos_course_id_day_video_type_key'
          ) THEN
            ALTER TABLE course_videos ADD CONSTRAINT course_videos_course_id_day_video_type_key 
            UNIQUE(course_id, day, video_type);
          END IF;
        END $$;
      `);
    } catch (migrationError) {
      // Migration errors are not critical - log and continue
      console.warn('⚠️ Schema migration warning (non-critical):', migrationError);
    }

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
    
    // Composite index for efficient pagination queries (course_id + created_at for ORDER BY)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_courses_course_created 
      ON user_courses(course_id, created_at DESC)
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
