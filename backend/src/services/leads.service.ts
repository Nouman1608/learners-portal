import { db } from '../config/database';
import { leads, enrollments, users } from '../db/schema';
import { eq, and, or, gte, lte, desc, ilike, SQL, sql } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import whatsappService from './whatsapp.service';

export interface CreateLeadInput {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  status?: 'new' | 'contacted' | 'interested' | 'enrolled' | 'lost';
  source?: string;
  potentialJoinDate?: string; // YYYY-MM-DD
  nextMessageDate?: string; // YYYY-MM-DD
  createdBy: string;
}

export interface UpdateLeadInput {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  status?: 'new' | 'contacted' | 'interested' | 'enrolled' | 'lost';
  potentialJoinDate?: string; // YYYY-MM-DD
  nextMessageDate?: string; // YYYY-MM-DD
}

export interface LeadFilters {
  status?: string;
  source?: string;
  startDate?: string; // Filter by creation date
  endDate?: string;
  nextMessageStartDate?: string; // Filter by next message date
  nextMessageEndDate?: string;
  search?: string; // Search in name, phone, email, notes
}

export const leadsService = {
  /**
   * Create a new lead
   */
  async createLead(input: CreateLeadInput) {
    try {
      // Validate and normalize phone number
      const normalizedPhone = whatsappService.validatePhoneNumber(input.phone);

      // Check if lead with same phone already exists
      const [existing] = await db
        .select()
        .from(leads)
        .where(eq(leads.phone, normalizedPhone))
        .limit(1);

      if (existing) {
        throw new AppError(400, 'A lead with this phone number already exists');
      }

      // Create lead
      const [newLead] = await db
        .insert(leads)
        .values({
          name: input.name,
          phone: normalizedPhone,
          email: input.email || null,
          notes: input.notes || null,
          status: input.status || 'new',
          source: input.source || 'manual',
          potentialJoinDate: input.potentialJoinDate || null,
          nextMessageDate: input.nextMessageDate || null,
          createdBy: input.createdBy,
        })
        .returning();

      logger.info('Lead created successfully', {
        leadId: newLead.id,
        name: newLead.name,
        phone: newLead.phone,
        source: newLead.source,
      });

      return newLead;
    } catch (error: any) {
      logger.error('Error creating lead', { error: error.message, input });
      throw error;
    }
  },

  /**
   * Get leads with optional filtering
   */
  async getLeads(filters: LeadFilters = {}) {
    try {
      const conditions: SQL<unknown>[] = [];

      // Filter by status
      if (filters.status) {
        conditions.push(eq(leads.status, filters.status));
      }

      // Filter by source
      if (filters.source) {
        conditions.push(eq(leads.source, filters.source));
      }

      // Filter by creation date range
      if (filters.startDate) {
        conditions.push(gte(leads.createdAt, new Date(filters.startDate)));
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999); // End of day
        conditions.push(lte(leads.createdAt, endDate));
      }

      // Filter by next message date range
      if (filters.nextMessageStartDate) {
        conditions.push(gte(leads.nextMessageDate, filters.nextMessageStartDate));
      }
      if (filters.nextMessageEndDate) {
        conditions.push(lte(leads.nextMessageDate, filters.nextMessageEndDate));
      }

      // Search in name, phone, email, notes
      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        conditions.push(
          or(
            ilike(leads.name, searchTerm),
            ilike(leads.phone, searchTerm),
            ilike(leads.email, searchTerm),
            ilike(leads.notes, searchTerm)
          )!
        );
      }

      // Build and execute query
      const result = conditions.length > 0
        ? await db.select().from(leads).where(and(...conditions)).orderBy(desc(leads.createdAt))
        : await db.select().from(leads).orderBy(desc(leads.createdAt));

      return result;
    } catch (error: any) {
      logger.error('Error getting leads', { error: error.message, filters });
      throw new AppError(500, 'Failed to retrieve leads');
    }
  },

  /**
   * Get a single lead by ID
   */
  async getLeadById(leadId: string) {
    try {
      const [lead] = await db
        .select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

      if (!lead) {
        throw new AppError(404, 'Lead not found');
      }

      return lead;
    } catch (error: any) {
      logger.error('Error getting lead by ID', { error: error.message, leadId });
      throw error;
    }
  },

  /**
   * Update lead information
   */
  async updateLead(leadId: string, input: UpdateLeadInput) {
    try {
      // Verify lead exists
      await this.getLeadById(leadId);

      const updateData: any = {
        updatedAt: new Date(),
      };

      // Validate and normalize phone if provided
      if (input.phone) {
        updateData.phone = whatsappService.validatePhoneNumber(input.phone);

        // Check if new phone conflicts with another lead
        const [existing] = await db
          .select()
          .from(leads)
          .where(and(eq(leads.phone, updateData.phone), sql`${leads.id} != ${leadId}`))
          .limit(1);

        if (existing) {
          throw new AppError(400, 'A lead with this phone number already exists');
        }
      }

      // Update other fields
      if (input.name !== undefined) updateData.name = input.name;
      if (input.email !== undefined) updateData.email = input.email || null;
      if (input.notes !== undefined) updateData.notes = input.notes || null;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.potentialJoinDate !== undefined) updateData.potentialJoinDate = input.potentialJoinDate || null;
      if (input.nextMessageDate !== undefined) updateData.nextMessageDate = input.nextMessageDate || null;

      const [updatedLead] = await db.update(leads).set(updateData).where(eq(leads.id, leadId)).returning();

      logger.info('Lead updated successfully', { leadId, updates: Object.keys(updateData) });

      return updatedLead;
    } catch (error: any) {
      logger.error('Error updating lead', { error: error.message, leadId, input });
      throw error;
    }
  },

  /**
   * Update lead status
   */
  async updateLeadStatus(leadId: string, status: 'new' | 'contacted' | 'interested' | 'enrolled' | 'lost') {
    try {
      const [updatedLead] = await db
        .update(leads)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId))
        .returning();

      if (!updatedLead) {
        throw new AppError(404, 'Lead not found');
      }

      logger.info('Lead status updated', { leadId, newStatus: status });

      return updatedLead;
    } catch (error: any) {
      logger.error('Error updating lead status', { error: error.message, leadId, status });
      throw error;
    }
  },

  /**
   * Delete a lead
   */
  async deleteLead(leadId: string) {
    try {
      const [deletedLead] = await db.delete(leads).where(eq(leads.id, leadId)).returning();

      if (!deletedLead) {
        throw new AppError(404, 'Lead not found');
      }

      logger.info('Lead deleted successfully', { leadId, name: deletedLead.name });

      return deletedLead;
    } catch (error: any) {
      logger.error('Error deleting lead', { error: error.message, leadId });
      throw error;
    }
  },

  /**
   * Create lead from dropped enrollment
   */
  async createLeadFromDroppedEnrollment(
    enrollmentId: string,
    studentData: {
      name: string;
      phone: string | null;
      email: string;
      tentativeReturnDate?: string;
      notes?: string;
      createdBy: string;
    }
  ) {
    try {
      // Validate phone number
      if (!studentData.phone) {
        logger.warn('Cannot create lead from dropped enrollment - no phone number', { enrollmentId });
        return null;
      }

      const normalizedPhone = whatsappService.validatePhoneNumber(studentData.phone);

      // Check if lead with this phone already exists
      const [existingLead] = await db
        .select()
        .from(leads)
        .where(eq(leads.phone, normalizedPhone))
        .limit(1);

      if (existingLead) {
        // Update existing lead with new drop info
        const updateData: any = {
          status: 'contacted', // Set to contacted since they were previously a student
          source: 'dropped_enrollment',
          originalEnrollmentId: enrollmentId,
          tentativeReturnDate: studentData.tentativeReturnDate || null,
          notes: studentData.notes
            ? `${existingLead.notes || ''}\n\n${studentData.notes}`.trim()
            : existingLead.notes,
          updatedAt: new Date(),
        };

        // Set next message date based on tentative return date
        if (studentData.tentativeReturnDate) {
          const returnDate = new Date(studentData.tentativeReturnDate);
          // Schedule message 1 week before tentative return date
          const messageDate = new Date(returnDate);
          messageDate.setDate(messageDate.getDate() - 7);
          updateData.nextMessageDate = messageDate.toISOString().split('T')[0];
        }

        const [updatedLead] = await db.update(leads).set(updateData).where(eq(leads.id, existingLead.id)).returning();

        logger.info('Updated existing lead from dropped enrollment', {
          leadId: existingLead.id,
          enrollmentId,
          tentativeReturnDate: studentData.tentativeReturnDate,
        });

        return updatedLead;
      }

      // Create new lead
      const leadData: any = {
        name: studentData.name,
        phone: normalizedPhone,
        email: studentData.email || null,
        notes: studentData.notes || `Auto-created from dropped enrollment`,
        status: 'contacted', // Set to contacted since they were previously a student
        source: 'dropped_enrollment',
        originalEnrollmentId: enrollmentId,
        tentativeReturnDate: studentData.tentativeReturnDate || null,
        createdBy: studentData.createdBy,
      };

      // Set next message date based on tentative return date
      if (studentData.tentativeReturnDate) {
        const returnDate = new Date(studentData.tentativeReturnDate);
        // Schedule message 1 week before tentative return date
        const messageDate = new Date(returnDate);
        messageDate.setDate(messageDate.getDate() - 7);
        leadData.nextMessageDate = messageDate.toISOString().split('T')[0];
      }

      const [newLead] = await db.insert(leads).values(leadData).returning();

      logger.info('Created lead from dropped enrollment', {
        leadId: newLead.id,
        enrollmentId,
        tentativeReturnDate: studentData.tentativeReturnDate,
        nextMessageDate: leadData.nextMessageDate,
      });

      return newLead;
    } catch (error: any) {
      logger.error('Error creating lead from dropped enrollment', {
        error: error.message,
        enrollmentId,
        studentData,
      });
      // Don't throw - this is a background operation, log and continue
      return null;
    }
  },

  /**
   * Get leads due for messaging (for cron job)
   */
  async getLeadsDueForMessage(targetDate?: string) {
    try {
      const date = targetDate || new Date().toISOString().split('T')[0];

      const result = await db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.nextMessageDate, date),
            eq(leads.optedOut, false),
            or(eq(leads.status, 'new'), eq(leads.status, 'contacted'), eq(leads.status, 'interested'))!
          )
        )
        .orderBy(leads.nextMessageDate);

      logger.info('Retrieved leads due for message', {
        date,
        count: result.length,
      });

      return result;
    } catch (error: any) {
      logger.error('Error getting leads due for message', { error: error.message, targetDate });
      throw new AppError(500, 'Failed to retrieve leads due for message');
    }
  },

  /**
   * Opt-out a lead from marketing messages
   */
  async optOutLead(leadId: string) {
    try {
      const [updatedLead] = await db
        .update(leads)
        .set({
          optedOut: true,
          optedOutAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId))
        .returning();

      if (!updatedLead) {
        throw new AppError(404, 'Lead not found');
      }

      logger.info('Lead opted out from marketing messages', { leadId, name: updatedLead.name });

      return updatedLead;
    } catch (error: any) {
      logger.error('Error opting out lead', { error: error.message, leadId });
      throw error;
    }
  },

  /**
   * Opt-in a lead to marketing messages
   */
  async optInLead(leadId: string) {
    try {
      const [updatedLead] = await db
        .update(leads)
        .set({
          optedOut: false,
          optedOutAt: null,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId))
        .returning();

      if (!updatedLead) {
        throw new AppError(404, 'Lead not found');
      }

      logger.info('Lead opted in to marketing messages', { leadId, name: updatedLead.name });

      return updatedLead;
    } catch (error: any) {
      logger.error('Error opting in lead', { error: error.message, leadId });
      throw error;
    }
  },

  /**
   * Convert lead to student
   */
  async convertLeadToStudent(leadId: string, studentId: string) {
    try {
      const [updatedLead] = await db
        .update(leads)
        .set({
          status: 'enrolled',
          convertedToStudentId: studentId,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId))
        .returning();

      if (!updatedLead) {
        throw new AppError(404, 'Lead not found');
      }

      logger.info('Lead converted to student', { leadId, studentId, name: updatedLead.name });

      return updatedLead;
    } catch (error: any) {
      logger.error('Error converting lead to student', { error: error.message, leadId, studentId });
      throw error;
    }
  },
};

export default leadsService;
