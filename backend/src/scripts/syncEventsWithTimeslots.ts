/**
 * Script to sync existing calendar events with their associated timeslots
 * This ensures all future scheduled events reflect their timeslot configuration
 *
 * Run with: npx tsx src/scripts/syncEventsWithTimeslots.ts
 */

import { db } from '../config/database';
import { courseEvents, courseTimeslots } from '../db/schema/courses';
import { eq, and, sql } from 'drizzle-orm';
import logger from '../utils/logger';

interface SyncResult {
  totalEvents: number;
  eventsToSync: number;
  eventsSynced: number;
  errors: number;
  details: Array<{
    eventId: string;
    timeslotId: string;
    changes: string[];
  }>;
}

async function syncEventsWithTimeslots(): Promise<SyncResult> {
  const result: SyncResult = {
    totalEvents: 0,
    eventsToSync: 0,
    eventsSynced: 0,
    errors: 0,
    details: [],
  };

  try {
    logger.info('Starting sync of events with timeslots...');

    // Get all future scheduled events that have a timeslot
    const events = await db
      .select({
        event: courseEvents,
        timeslot: courseTimeslots,
      })
      .from(courseEvents)
      .leftJoin(courseTimeslots, eq(courseEvents.timeslotId, courseTimeslots.id))
      .where(
        and(
          sql`${courseEvents.timeslotId} IS NOT NULL`,
          sql`${courseEvents.eventDate} >= CURRENT_DATE`,
          eq(courseEvents.status, 'scheduled')
        )
      );

    result.totalEvents = events.length;
    logger.info(`Found ${result.totalEvents} future scheduled events with timeslots`);

    // Process each event
    for (const { event, timeslot } of events) {
      if (!timeslot) {
        logger.warn(`Event ${event.id} has timeslot reference but timeslot not found`);
        result.errors++;
        continue;
      }

      // Check what needs to be synced
      const updates: any = {};
      const changes: string[] = [];

      if (event.startTime !== timeslot.startTime) {
        updates.startTime = timeslot.startTime;
        changes.push(`startTime: ${event.startTime} → ${timeslot.startTime}`);
      }

      if (event.endTime !== timeslot.endTime) {
        updates.endTime = timeslot.endTime;
        changes.push(`endTime: ${event.endTime} → ${timeslot.endTime}`);
      }

      if (event.roomId !== timeslot.roomId) {
        updates.roomId = timeslot.roomId;
        changes.push(`roomId: ${event.roomId || 'null'} → ${timeslot.roomId || 'null'}`);
      }

      if (event.teacherId !== timeslot.teacherId) {
        updates.teacherId = timeslot.teacherId;
        changes.push(`teacherId: ${event.teacherId || 'null'} → ${timeslot.teacherId || 'null'}`);
      }

      if (event.classType !== timeslot.classType) {
        updates.classType = timeslot.classType;
        changes.push(`classType: ${event.classType} → ${timeslot.classType}`);
      }

      if (event.teamsMeetingId !== timeslot.teamsMeetingId) {
        updates.teamsMeetingId = timeslot.teamsMeetingId;
        changes.push(`teamsMeetingId: ${event.teamsMeetingId || 'null'} → ${timeslot.teamsMeetingId || 'null'}`);
      }

      if (event.teamsMeetingUrl !== timeslot.teamsMeetingUrl) {
        updates.teamsMeetingUrl = timeslot.teamsMeetingUrl;
        changes.push(`teamsMeetingUrl: ${event.teamsMeetingUrl || 'null'} → ${timeslot.teamsMeetingUrl || 'null'}`);
      }

      if (event.teamsCreatedBy !== timeslot.teamsCreatedBy) {
        updates.teamsCreatedBy = timeslot.teamsCreatedBy;
        changes.push(`teamsCreatedBy: ${event.teamsCreatedBy || 'null'} → ${timeslot.teamsCreatedBy || 'null'}`);
      }

      // If there are changes, update the event
      if (Object.keys(updates).length > 0) {
        result.eventsToSync++;

        try {
          updates.updatedAt = new Date();

          await db
            .update(courseEvents)
            .set(updates)
            .where(eq(courseEvents.id, event.id));

          result.eventsSynced++;
          result.details.push({
            eventId: event.id,
            timeslotId: timeslot.id,
            changes,
          });

          logger.info(`Synced event ${event.id}: ${changes.join(', ')}`);
        } catch (error) {
          logger.error(`Error syncing event ${event.id}:`, error);
          result.errors++;
        }
      }
    }

    // Log summary
    logger.info('='.repeat(60));
    logger.info('Sync completed!');
    logger.info(`Total events checked: ${result.totalEvents}`);
    logger.info(`Events needing sync: ${result.eventsToSync}`);
    logger.info(`Events synced successfully: ${result.eventsSynced}`);
    logger.info(`Errors: ${result.errors}`);
    logger.info('='.repeat(60));

    if (result.details.length > 0) {
      logger.info('\nDetailed changes:');
      result.details.forEach((detail, index) => {
        logger.info(`\n${index + 1}. Event ${detail.eventId} (Timeslot: ${detail.timeslotId})`);
        detail.changes.forEach(change => {
          logger.info(`   - ${change}`);
        });
      });
    }

    return result;
  } catch (error) {
    logger.error('Fatal error during sync:', error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  syncEventsWithTimeslots()
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

export default syncEventsWithTimeslots;
