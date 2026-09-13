import { Router } from 'express';
import * as currencyController from '../controllers/currency.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', currencyController.getSupportedCurrencies);
router.get('/:code', currencyController.getExchangeRate);

export default router;
