import { Router } from 'express';
import authRoutes from './auth.routes';
import usersRoutes from './users.routes';
import coursesRoutes from './courses.routes';
import roomsRoutes from './rooms.routes';
import enrollmentsRoutes from './enrollments.routes';
import feesRoutes from './fees.routes';
import uploadsRoutes from './uploads.routes';
import calendarRoutes from './calendar.routes';
import assessmentsRoutes from './assessments.routes';
import invoicesRoutes from './invoices.routes';
import logsRoutes from './logs.routes';
import dashboardRoutes from './dashboard.routes';
import teamsRoutes from './teams.routes';
import attendanceRoutes from './attendance.routes';
import analyticsRoutes from './analytics.routes';
import studentPortalRoutes from './student-portal.routes';
import leadsRoutes from './leads.routes';
import messagesRoutes from './messages.routes';
import whatsappWebhookRoutes from './whatsapp-webhook.routes';
import currencyRoutes from './currency.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/teams', teamsRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/student-portal', studentPortalRoutes);
router.use('/users', usersRoutes);
router.use('/courses', coursesRoutes);
router.use('/rooms', roomsRoutes);
router.use('/enrollments', enrollmentsRoutes);
router.use('/fees', feesRoutes);
router.use('/currencies', currencyRoutes);
router.use('/uploads', uploadsRoutes);
router.use('/calendar', calendarRoutes);
router.use('/assessments', assessmentsRoutes);
router.use('/invoices', invoicesRoutes);
router.use('/logs', logsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/leads', leadsRoutes);
router.use('/messages', messagesRoutes);
router.use('/webhooks/whatsapp', whatsappWebhookRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
