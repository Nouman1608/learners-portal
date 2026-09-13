/**
 * Script to remove all calendar events before today
 * This helps clean up old events and reduce database size
 *
 * Run with: npx tsx src/scripts/cleanOldEvents.ts
 * Run with --apply flag to actually delete: npx tsx src/scripts/cleanOldEvents.ts --apply
 */

import { db } from '../config/database';
import { courseEvents } from '../db/schema/courses';
import { sql, lt } from 'drizzle-orm';
import logger from '../utils/logger';

interface CleanResult {
  totalEvents: number;
  eventsToDelete: number;
  eventsDeleted: number;
  errors: number;
  details: Array<{
    id: string;
    courseTitle: string;
    eventDate: string;
    status: string;
  }>;
}

async function cleanOldEvents(dryRun: boolean = true): Promise<CleanResult> {
  const result: CleanResult = {
    totalEvents: 0,
    eventsToDelete: 0,
    eventsDeleted: 0,
    errors: 0,
    details: [],
  };

  try {
    const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format

    logger.info('Starting cleanup of old calendar events...');
    logger.info(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (events will be deleted)'}`);
    logger.info(`Cutoff date: Events before ${today} will be removed`);

    // Get all events before today with their course information
    const oldEvents = await db
      .select({
        id: courseEvents.id,
        eventDate: courseEvents.eventDate,
        status: courseEvents.status,
        courseId: courseEvents.courseId,
        courseTitle: sql<string>`c.title`,
      })
      .from(courseEvents)
      .leftJoin(sql`courses c`, sql`${courseEvents.courseId} = c.id`)
      .where(lt(courseEvents.eventDate, today));

    result.totalEvents = oldEvents.length;
    result.eventsToDelete = oldEvents.length;

    logger.info(`Found ${result.totalEvents} events before ${today}`);

    if (result.totalEvents === 0) {
      logger.info('No old events to clean up.');
      return result;
    }

    // Log details of events to be deleted
    for (const event of oldEvents) {
      result.details.push({
        id: event.id,
        courseTitle: event.courseTitle || 'Unknown Course',
        eventDate: event.eventDate,
        status: event.status,
      });
    }

    if (!dryRun) {
      // Delete old events
      try {
        await db
          .delete(courseEvents)
          .where(lt(courseEvents.eventDate, today));

        result.eventsDeleted = result.eventsToDelete;
        logger.info(`Successfully deleted ${result.eventsDeleted} old events`);
      } catch (error) {
        logger.error('Error deleting old events:', error);
        result.errors++;
        throw error;
      }
    }

    // Log summary
    logger.info('='.repeat(80));
    if (dryRun) {
      logger.info('DRY RUN COMPLETED - NO CHANGES WERE MADE');
    } else {
      logger.info('CLEANUP COMPLETED');
    }
    logger.info(`Total events found: ${result.totalEvents}`);
    logger.info(`Events before ${today}: ${result.eventsToDelete}`);
    if (!dryRun) {
      logger.info(`Events deleted: ${result.eventsDeleted}`);
      logger.info(`Errors: ${result.errors}`);
    }
    logger.info('='.repeat(80));

    if (result.details.length > 0 && dryRun) {
      logger.info('\nEvents to be deleted (showing first 50):');
      logger.info('-'.repeat(80));
      result.details.slice(0, 50).forEach((detail, index) => {
        logger.info(
          `${index + 1}. ${detail.courseTitle} - ${detail.eventDate} (${detail.status})`
        );
      });
      if (result.details.length > 50) {
        logger.info(`... and ${result.details.length - 50} more`);
      }
    }

    if (dryRun && result.eventsToDelete > 0) {
      logger.info('\n' + '='.repeat(80));
      logger.info('To apply these changes, run:');
      logger.info('npm run clean:old-events -- --apply');
      logger.info('='.repeat(80));
    }

    return result;
  } catch (error) {
    logger.error('Fatal error during cleanup:', error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  // Check for --apply flag
  const applyChanges = process.argv.includes('--apply');
  const dryRun = !applyChanges;

  cleanOldEvents(dryRun)
    .then((result) => {
      if (result.errors > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Script failed:', error);
      process.exit(1);
    });
}

export default cleanOldEvents;
