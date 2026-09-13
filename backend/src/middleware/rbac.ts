import { Request, Response, NextFunction } from 'express';
import { Role } from '../types';
import logger from '../utils/logger';

export const requireRole = (allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role as Role)) {
      logger.warn(
        `Access denied for user ${req.user.username} (${req.user.role}) to resource requiring roles: ${allowedRoles.join(', ')}`
      );
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Convenience middleware for common role combinations
export const requireSudo = requireRole(['sudo']);
export const requireAdmin = requireRole(['sudo', 'admin']);
export const requireTeacher = requireRole(['sudo', 'admin', 'teacher']);
export const requireStudent = requireRole(['sudo', 'admin', 'teacher', 'student']);

// Check if user is the owner of a resource or has admin privileges
export const requireOwnerOrAdmin = (userIdGetter: (req: Request) => string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const resourceUserId = userIdGetter(req);
    const isOwner = req.user.id === resourceUserId;
    const isAdmin = ['sudo', 'admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      logger.warn(
        `Access denied for user ${req.user.username} to resource owned by user ${resourceUserId}`
      );
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
};
