import { Router } from 'express';
import * as calendarController from '../controllers/calendar.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireTeacher, requireStudent, requireSudo } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get events (all authenticated users can view)
router.get('/', requireStudent, calendarController.getEvents);
router.get('/:id', requireStudent, calendarController.getEventById);

// Create and update events (admin and teachers only)
router.post('/', requireTeacher, logActivity('create', 'event'), calendarController.createEvent);
router.patch('/:id', requireTeacher, logActivity('update', 'event'), calendarController.updateEvent);

// Cancel and complete events
router.patch('/:id/cancel', requireTeacher, logActivity('cancel', 'event'), calendarController.cancelEvent);
router.patch('/:id/complete', requireTeacher, logActivity('complete', 'event'), calendarController.completeEvent);
router.post('/bulk-complete', requireAdmin, logActivity('bulk-complete', 'event'), calendarController.bulkCompleteEvents);

// Check for scheduling conflicts
router.post('/check-conflicts', requireTeacher, calendarController.checkConflicts);

// Generate upcoming events (admin only, can also be triggered by cron)
router.post('/generate', requireAdmin, logActivity('generate-events', 'calendar'), calendarController.generateUpcomingEvents);

// Delete events (sudo only)
router.delete('/:id', requireSudo, logActivity('delete', 'event'), calendarController.deleteEvent);
router.delete('/:id/recurring', requireSudo, logActivity('delete-recurring', 'event'), calendarController.deleteRecurringEvents);

export default router;
