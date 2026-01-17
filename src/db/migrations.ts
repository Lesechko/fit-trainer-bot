import { db } from '../db';

/**
 * Migration system for database schema changes
 * Each migration should be idempotent (safe to run multiple times)
 */

export interface Migration {
  name: string;
  up: () => Promise<void>;
}

/**
 * List of all migrations in chronological order
 */
const migrations: Migration[] = [
  {
    name: 'add_entry_source_column',
    up: async () => {
      await db.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'entry_source'
          ) THEN
            ALTER TABLE users ADD COLUMN entry_source TEXT;
            CREATE INDEX IF NOT EXISTS idx_users_entry_source ON users(entry_source);
          END IF;
        END $$;
      `);
    },
  },
  // Add future migrations here
];

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');
  
  for (const migration of migrations) {
    try {
      console.log(`Running migration: ${migration.name}`);
      await migration.up();
      console.log(`✅ Migration ${migration.name} completed`);
    } catch (error) {
      console.error(`❌ Migration ${migration.name} failed:`, error);
      throw error;
    }
  }
  
  console.log('✅ All migrations completed');
}
