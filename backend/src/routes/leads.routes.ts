import { Router } from 'express';
import * as leadsController from '../controllers/leads.controller';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireSudo } from '../middleware/rbac';
import { logActivity } from '../middleware/requestLogger';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Leads CRUD - admin and sudo can access
router.get('/', requireAdmin, leadsController.getLeads);
router.get('/due-for-message', requireSudo, leadsController.getLeadsDueForMessage);
router.get('/:id', requireAdmin, leadsController.getLeadById);
router.post('/', requireAdmin, logActivity('create', 'lead'), leadsController.createLead);
router.put('/:id', requireAdmin, logActivity('update', 'lead'), leadsController.updateLead);
router.put('/:id/status', requireAdmin, logActivity('update-status', 'lead'), leadsController.updateLeadStatus);
router.delete('/:id', requireAdmin, logActivity('delete', 'lead'), leadsController.deleteLead);

// Lead opt-out management
router.post('/:id/opt-out', requireAdmin, logActivity('opt-out', 'lead'), leadsController.optOutLead);
router.post('/:id/opt-in', requireAdmin, logActivity('opt-in', 'lead'), leadsController.optInLead);

// Lead conversion
router.post('/:id/convert', requireAdmin, logActivity('convert', 'lead'), leadsController.convertLeadToStudent);

export default router;
