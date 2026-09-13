import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logsService } from '../services/logs.service';

// Validation schemas
const getLogsSchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const getStatsSchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
});

export const getLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = getLogsSchema.parse(req.query);

    const filters: any = {
      ...validated,
    };

    // Convert date strings to Date objects
    if (validated.startDate) {
      filters.startDate = new Date(validated.startDate);
    }
    if (validated.endDate) {
      filters.endDate = new Date(validated.endDate);
    }

    const result = await logsService.getLogs(filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getLogById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = await logsService.getLogById(req.params.id);

    if (!log) {
      return res.status(404).json({ message: 'Log not found' });
    }

    res.json({ log });
  } catch (error) {
    next(error);
  }
};

export const getUniqueActions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actions = await logsService.getUniqueActions();
    res.json({ actions });
  } catch (error) {
    next(error);
  }
};

export const getUniqueResources = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resources = await logsService.getUniqueResources();
    res.json({ resources });
  } catch (error) {
    next(error);
  }
};

export const getStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = getStatsSchema.parse(req.query);
    const stats = await logsService.getStats(validated.days);
    res.json(stats);
  } catch (error) {
    next(error);
  }
};
