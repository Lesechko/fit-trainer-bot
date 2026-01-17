import 'dotenv/config';
import { runMigrations } from '../db/migrations';

/**
 * Standalone script to run database migrations
 * Usage: npm run migrate
 */
async function main() {
  try {
    await runMigrations();
    console.log('✅ Migration script completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  }
}

main();
