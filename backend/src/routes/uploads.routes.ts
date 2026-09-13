import { Router } from 'express';
import * as uploadsController from '../controllers/uploads.controller';
import { authenticate } from '../middleware/auth';
import { requireStudent } from '../middleware/rbac';
import { uploadSingle, uploadMultiple } from '../middleware/upload';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Upload single file (for payment proofs)
router.post(
  '/single',
  requireStudent,
  uploadSingle('file'),
  uploadsController.uploadFile
);

// Upload multiple files
router.post(
  '/multiple',
  requireStudent,
  uploadMultiple('files', 5),
  uploadsController.uploadMultipleFiles
);

export default router;
