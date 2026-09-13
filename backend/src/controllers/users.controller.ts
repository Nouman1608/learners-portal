import { Request, Response } from 'express';
import { z } from 'zod';
import usersService from '../services/users.service';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'teacher', 'student'], {
    errorMap: () => ({ message: 'Invalid role' }),
  }),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  parentPhone: z.string().optional(),
  studentCategory: z.string().optional(),
  studentSubcategory: z.string().optional(),
  whatsappGroupLink: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  teamsUsername: z.string().max(100).optional().or(z.literal('')),
  // Teacher fee configuration (only for teachers)
  localStudentFeePercentage: z.number()
    .min(0, 'Fee percentage must be between 0 and 100')
    .max(100, 'Fee percentage must be between 0 and 100')
    .optional(),
  onlineStudentFixedAmountIg: z.number()
    .min(0, 'Fixed amount must be non-negative')
    .optional(),
  onlineStudentFixedAmountAlevel: z.number()
    .min(0, 'Fixed amount must be non-negative')
    .optional(),
  teacherPaymentType: z.enum(['percentage_based', 'salaried']).optional(),
  monthlySalary: z.number()
    .min(0, 'Monthly salary must be non-negative')
    .optional(),
}).refine(
  (data) => {
    if (data.role !== 'teacher') return true;

    const paymentType = data.teacherPaymentType || 'percentage_based';

    if (paymentType === 'salaried') {
      return data.monthlySalary !== undefined && data.monthlySalary > 0;
    }

    // percentage_based: require the 3 per-student fields
    return data.localStudentFeePercentage !== undefined &&
           data.onlineStudentFixedAmountIg !== undefined &&
           data.onlineStudentFixedAmountAlevel !== undefined;
  },
  {
    message: 'Salaried teachers require monthlySalary. Percentage-based teachers require localStudentFeePercentage, onlineStudentFixedAmountIg, and onlineStudentFixedAmountAlevel',
    path: ['role'],
  }
);

const updateUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  parentPhone: z.string().optional(),
  studentCategory: z.string().optional(),
  studentSubcategory: z.string().optional(),
  whatsappGroupLink: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  teamsUsername: z.string().max(100).optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  role: z.enum(['admin', 'teacher', 'student']).optional(),
  // Teacher fee configuration — null clears a field (e.g. on payment-type switch)
  localStudentFeePercentage: z.number()
    .min(0, 'Fee percentage must be between 0 and 100')
    .max(100, 'Fee percentage must be between 0 and 100')
    .nullable()
    .optional(),
  onlineStudentFixedAmountIg: z.number()
    .min(0, 'Fixed amount must be non-negative')
    .nullable()
    .optional(),
  onlineStudentFixedAmountAlevel: z.number()
    .min(0, 'Fixed amount must be non-negative')
    .nullable()
    .optional(),
  teacherPaymentType: z.enum(['percentage_based', 'salaried']).optional(),
  monthlySalary: z.number()
    .min(0, 'Monthly salary must be non-negative')
    .nullable()
    .optional(),
}).refine(
  (data) => {
    // Switching to salaried requires a positive salary in the same request,
    // otherwise invoicing rejects the teacher with "fee configuration not set"
    if (data.teacherPaymentType === 'salaried') {
      return data.monthlySalary !== undefined && data.monthlySalary > 0;
    }
    return true;
  },
  {
    message: 'monthlySalary (> 0) is required when setting teacherPaymentType to salaried',
    path: ['monthlySalary'],
  }
);

const changePasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

export const createUser = async (req: Request, res: Response) => {
  try {
    const validatedData = createUserSchema.parse(req.body);

    // Sudo cannot be created via API (check in case schema is modified)
    if ((validatedData.role as string) === 'sudo') {
      throw new AppError(400, 'Cannot create sudo user via API');
    }

    const user = await usersService.createUser({
      ...validatedData,
      createdBy: req.user!.id,
    });

    logger.info(`User created: ${user.username} by ${req.user!.username}`);

    return res.status(201).json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    throw error;
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const role = req.query.role as string | undefined;
    const search = req.query.search as string | undefined;
    const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
    const studentCategory = req.query.studentCategory as string | undefined;
    const studentSubcategory = req.query.studentSubcategory as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    let users = await usersService.getUsers({
      role: role as any,
      search,
      isActive,
      studentCategory,
      studentSubcategory,
      limit,
      offset,
    });

    // If the requester is a teacher and requesting teachers, only return themselves
    if (req.user?.role === 'teacher' && role === 'teacher') {
      users = users.filter(user => user.id === req.user?.id);
    }

    return res.json({ users, count: users.length });
  } catch (error) {
    throw error;
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const user = await usersService.getUserById(req.params.id);
    return res.json({ user });
  } catch (error) {
    throw error;
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const validatedData = updateUserSchema.parse(req.body);

    // Prevent users from deactivating themselves
    if (validatedData.isActive === false && req.params.id === req.user!.id) {
      throw new AppError(400, 'Cannot deactivate your own account');
    }

    // Only sudo users can update roles
    if (validatedData.role && req.user!.role !== 'sudo') {
      throw new AppError(403, 'Only sudo users can update user roles');
    }

    const user = await usersService.updateUser(req.params.id, validatedData);

    logger.info(`User updated: ${user.username} by ${req.user!.username}`);

    return res.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    throw error;
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    // Prevent users from deleting themselves
    if (req.params.id === req.user!.id) {
      throw new AppError(400, 'Cannot delete your own account');
    }

    const result = await usersService.deleteUser(req.params.id);

    logger.info(`User deleted: ${req.params.id} by ${req.user!.username}`);

    return res.json(result);
  } catch (error) {
    throw error;
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const validatedData = changePasswordSchema.parse(req.body);

    await usersService.changePassword(req.params.id, validatedData.newPassword);

    logger.info(`Password changed for user: ${req.params.id} by ${req.user!.username}`);

    return res.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    throw error;
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const validatedData = resetPasswordSchema.parse(req.body);

    // Prevent resetting your own password through this endpoint
    if (req.params.id === req.user!.id) {
      throw new AppError(400, 'Cannot reset your own password through this endpoint');
    }

    // Generate a random temporary password if not provided
    const tempPassword = validatedData.newPassword || Math.random().toString(36).slice(-10) + 'A1!';

    const result = await usersService.resetPassword(req.params.id, tempPassword);

    logger.info(`Password reset for user: ${req.params.id} by admin: ${req.user!.username}`);

    return res.json({
      message: 'Password reset successfully',
      temporaryPassword: tempPassword
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    throw error;
  }
};

export const getUsersByRole = async (req: Request, res: Response) => {
  try {
    const role = req.params.role as 'admin' | 'teacher' | 'student';

    if (!['admin', 'teacher', 'student'].includes(role)) {
      throw new AppError(400, 'Invalid role');
    }

    const users = await usersService.getUsersByRole(role);

    return res.json({ users, count: users.length });
  } catch (error) {
    throw error;
  }
};
