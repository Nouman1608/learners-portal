/**
 * Script to sync fees with their enrollment's customFeePerMonth
 * This fixes mismatches where enrollment fees were updated but existing fees weren't synced
 *
 * Run with: npx tsx src/scripts/syncFeesWithEnrollments.ts
 */

import { db } from '../config/database';
import { fees, enrollments } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import logger from '../utils/logger';

interface SyncResult {
  totalFees: number;
  feesToSync: number;
  feesSynced: number;
  errors: number;
  details: Array<{
    feeId: string;
    enrollmentId: string;
    studentName: string;
    courseName: string;
    oldAmount: string;
    newAmount: string;
    month: number;
    year: number;
  }>;
}

async function syncFeesWithEnrollments(dryRun: boolean = true): Promise<SyncResult> {
  const result: SyncResult = {
    totalFees: 0,
    feesToSync: 0,
    feesSynced: 0,
    errors: 0,
    details: [],
  };

  try {
    logger.info('Starting sync of fees with enrollment fees...');
    logger.info(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);

    // Get all fees with their enrollment details (only pending and submitted status)
    const allFees = await db
      .select({
        fee: fees,
        enrollment: enrollments,
      })
      .from(fees)
      .innerJoin(enrollments, eq(fees.enrollmentId, enrollments.id))
      .where(
        and(
          sql`${fees.status} IN ('pending', 'submitted')` // Only sync fees that haven't been received
        )
      );

    result.totalFees = allFees.length;
    logger.info(`Found ${result.totalFees} fees (pending or submitted)`);

    // Process each fee
    for (const { fee, enrollment } of allFees) {
      // Skip if enrollment doesn't have a customFeePerMonth
      if (!enrollment.customFeePerMonth) {
        logger.warn(
          `Enrollment ${enrollment.id} has no customFeePerMonth set. ` +
          `Fee ${fee.id} cannot be synced.`
        );
        continue;
      }

      // Check if fee amount matches enrollment's customFeePerMonth
      if (fee.amount !== enrollment.customFeePerMonth) {
        result.feesToSync++;

        // Get student and course names for reporting
        const [feeDetails] = await db
          .select({
            studentFirstName: sql<string>`u.first_name`,
            studentLastName: sql<string>`u.last_name`,
            courseTitle: sql<string>`c.title`,
          })
          .from(fees)
          .innerJoin(sql`users u`, eq(fees.studentId, sql`u.id`))
          .innerJoin(sql`courses c`, eq(fees.courseId, sql`c.id`))
          .where(eq(fees.id, fee.id))
          .limit(1);

        const studentName = feeDetails
          ? `${feeDetails.studentFirstName} ${feeDetails.studentLastName}`
          : 'Unknown Student';
        const courseName = feeDetails?.courseTitle || 'Unknown Course';

        result.details.push({
          feeId: fee.id,
          enrollmentId: enrollment.id,
          studentName,
          courseName,
          oldAmount: fee.amount,
          newAmount: enrollment.customFeePerMonth,
          month: fee.month,
          year: fee.year,
        });

        if (!dryRun) {
          // Update the fee amount
          try {
            await db
              .update(fees)
              .set({
                amount: enrollment.customFeePerMonth,
                updatedAt: new Date(),
              })
              .where(eq(fees.id, fee.id));

            result.feesSynced++;
            logger.info(
              `Synced fee ${fee.id}: ${studentName} - ${courseName} (${fee.month}/${fee.year}) ` +
              `${fee.amount} → ${enrollment.customFeePerMonth}`
            );
          } catch (error) {
            logger.error(`Error syncing fee ${fee.id}:`, error);
            result.errors++;
          }
        }
      }
    }

    // Log summary
    logger.info('='.repeat(80));
    if (dryRun) {
      logger.info('DRY RUN COMPLETED - NO CHANGES WERE MADE');
    } else {
      logger.info('SYNC COMPLETED');
    }
    logger.info(`Total fees checked: ${result.totalFees}`);
    logger.info(`Fees needing sync: ${result.feesToSync}`);
    if (!dryRun) {
      logger.info(`Fees synced successfully: ${result.feesSynced}`);
      logger.info(`Errors: ${result.errors}`);
    }
    logger.info('='.repeat(80));

    if (result.details.length > 0) {
      logger.info('\nDetailed changes:');
      logger.info('-'.repeat(80));
      result.details.forEach((detail, index) => {
        logger.info(
          `${index + 1}. ${detail.studentName} - ${detail.courseName} (${detail.month}/${detail.year})`
        );
        logger.info(`   Fee ID: ${detail.feeId}`);
        logger.info(`   Enrollment ID: ${detail.enrollmentId}`);
        logger.info(`   Amount: PKR ${detail.oldAmount} → PKR ${detail.newAmount}`);
        logger.info('');
      });
    }

    if (dryRun && result.feesToSync > 0) {
      logger.info('\n' + '='.repeat(80));
      logger.info('To apply these changes, run:');
      logger.info('npm run sync:fees -- --apply');
      logger.info('='.repeat(80));
    }

    return result;
  } catch (error) {
    logger.error('Fatal error during sync:', error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  // Check for --apply flag
  const applyChanges = process.argv.includes('--apply');
  const dryRun = !applyChanges;

  syncFeesWithEnrollments(dryRun)
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

export default syncFeesWithEnrollments;
