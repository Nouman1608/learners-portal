import dotenv from 'dotenv';
import path from 'path';

// Load environment variables BEFORE importing database config
// Use process.cwd() to get the project root directory
const envPath = path.join(process.cwd(), '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('❌ Failed to load .env file:', result.error);
  console.error('Looking for .env at:', envPath);
} else {
  console.log('✅ Loaded .env from:', envPath);
  console.log('DATABASE_URL:', process.env.DATABASE_URL );
}

import { db } from '../config/database';
import { users } from './schema';
import { hashPassword } from '../utils/bcrypt';
import logger from '../utils/logger';
import { eq } from 'drizzle-orm';

async function seed() {
  try {
    logger.info('Starting database seeding...');

    // Check if sudo user already exists
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.username, 'sudo'))
      .limit(1);

    if (existingUsers.length > 0) {
      logger.info('⚠️  Sudo user already exists, skipping seed');
      return;
    }

    // Create sudo user
    const passwordHash = await hashPassword('Admin@123');
console.log('has', passwordHash);
    await db.insert(users).values({
      username: 'sudo',
      passwordHash,
      role: 'sudo',
      firstName: 'Super',
      lastName: 'Admin',
      email: 'sudo@learnersacademy.edu',
      isActive: true,
    });

    logger.info('✅ Seed completed successfully');
    logger.info('📝 Login credentials:');
    logger.info('   Username: sudo');
    logger.info('   Password: Admin@123');
    logger.info('⚠️  IMPORTANT: Change the password after first login in production!');
  } catch (error) {
    logger.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seed();
