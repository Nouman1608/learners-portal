import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { leadsService } from '../services/leads.service';

// Validation schemas
const createLeadSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(20),
  email: z.string().email().max(255).optional(),
  notes: z.string().max(5000).optional(),
  status: z.enum(['new', 'contacted', 'interested', 'enrolled', 'lost']).optional(),
  source: z.string().max(50).optional(),
  potentialJoinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nextMessageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const updateLeadSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().min(1).max(20).optional(),
  // '' clears the field (the service maps falsy → null)
  email: z.string().email().max(255).optional().or(z.literal('')),
  notes: z.string().max(5000).optional(),
  status: z.enum(['new', 'contacted', 'interested', 'enrolled', 'lost']).optional(),
  potentialJoinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  nextMessageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

const updateLeadStatusSchema = z.object({
  status: z.enum(['new', 'contacted', 'interested', 'enrolled', 'lost']),
});

const leadFiltersSchema = z.object({
  status: z.string().optional(),
  source: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nextMessageStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nextMessageEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().optional(),
});

/**
 * Create a new lead
 * POST /api/leads
 * Access: admin, sudo
 */
export const createLead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createLeadSchema.parse(req.body);
    const lead = await leadsService.createLead({
      ...validated,
      createdBy: req.user!.id,
    });
    res.status(201).json({ lead });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all leads with optional filtering
 * GET /api/leads
 * Access: admin, sudo
 */
export const getLeads = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = leadFiltersSchema.parse(req.query);
    const leads = await leadsService.getLeads(filters);
    res.json({ leads });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single lead by ID
 * GET /api/leads/:id
 * Access: admin, sudo
 */
export const getLeadById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lead = await leadsService.getLeadById(req.params.id);
    res.json({ lead });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a lead
 * PUT /api/leads/:id
 * Access: admin, sudo
 */
export const updateLead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateLeadSchema.parse(req.body);
    const lead = await leadsService.updateLead(req.params.id, validated);
    res.json({ lead });
  } catch (error) {
    next(error);
  }
};

/**
 * Update lead status
 * PUT /api/leads/:id/status
 * Access: admin, sudo
 */
export const updateLeadStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = updateLeadStatusSchema.parse(req.body);
    const lead = await leadsService.updateLeadStatus(req.params.id, status);
    res.json({ lead });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a lead
 * DELETE /api/leads/:id
 * Access: admin, sudo
 */
export const deleteLead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lead = await leadsService.deleteLead(req.params.id);
    res.json({ message: 'Lead deleted successfully', lead });
  } catch (error) {
    next(error);
  }
};

/**
 * Opt-out a lead from marketing messages
 * POST /api/leads/:id/opt-out
 * Access: admin, sudo
 */
export const optOutLead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lead = await leadsService.optOutLead(req.params.id);
    res.json({ message: 'Lead opted out successfully', lead });
  } catch (error) {
    next(error);
  }
};

/**
 * Opt-in a lead to marketing messages
 * POST /api/leads/:id/opt-in
 * Access: admin, sudo
 */
export const optInLead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lead = await leadsService.optInLead(req.params.id);
    res.json({ message: 'Lead opted in successfully', lead });
  } catch (error) {
    next(error);
  }
};

/**
 * Convert lead to student
 * POST /api/leads/:id/convert
 * Access: admin, sudo
 */
export const convertLeadToStudent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = z.object({ studentId: z.string().uuid() }).parse(req.body);
    const lead = await leadsService.convertLeadToStudent(req.params.id, studentId);
    res.json({ message: 'Lead converted to student successfully', lead });
  } catch (error) {
    next(error);
  }
};

/**
 * Get leads due for messaging
 * GET /api/leads/due-for-message
 * Access: sudo only
 */
export const getLeadsDueForMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
    const leads = await leadsService.getLeadsDueForMessage(date);
    res.json({ leads });
  } catch (error) {
    next(error);
  }
};
