import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import assignmentsService from '../services/assignments.service';
import { removeStoredFiles } from '../middleware/assignmentUpload';
import { AppError } from '../middleware/errorHandler';

const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);
const DATE = z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional());
const MARKS = z.preprocess(emptyToNull, z.string().regex(/^\d+(\.\d{1,2})?$/, 'Marks must be a number').nullable().optional());
const uuidList = z.preprocess(
  (value) => (typeof value === 'string' ? JSON.parse(value || '[]') : value),
  z.array(z.string().uuid()).optional(),
);

const createSchema = z.object({
  title: z.string().trim().min(1, 'Give the assignment a title').max(200),
  instructions: z.string().max(10000).optional(),
  dueDate: DATE,
  maxMarks: MARKS,
  courseId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  studentIds: uuidList,
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().max(10000).optional(),
  dueDate: DATE,
  maxMarks: MARKS,
  removeFileIds: uuidList,
});

const gradeSchema = z.object({
  marks: z.preprocess(emptyToNull, z.union([z.string(), z.number()]).transform((v) => String(v)).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, 'Marks must be a number')).nullable()),
  feedback: z.string().max(5000).nullable().optional(),
});

const actor = (req: Request) => ({ id: req.user!.id, role: req.user!.role });
const uploaded = (req: Request) => (req.files as Express.Multer.File[] | undefined) ?? [];

/** Runs a handler; if it fails, the files that were just uploaded are deleted again */
const withCleanup = (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (error) {
      removeStoredFiles(uploaded(req).map((f) => `/uploads/assignments/${f.filename}`));
      if (error instanceof SyntaxError) return next(new AppError(400, 'Invalid request'));
      next(error);
    }
  };

export const getAudience = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json({ classes: await assignmentsService.audience(actor(req)) }); } catch (error) { next(error); }
};

export const listAssignments = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json({ assignments: await assignmentsService.list(actor(req)) }); } catch (error) { next(error); }
};

export const createAssignment = withCleanup(async (req, res) => {
  const input = createSchema.parse(req.body);
  const created = await assignmentsService.create(actor(req), input, uploaded(req));
  res.status(201).json({ id: created.id });
});

export const getAssignment = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await assignmentsService.getDetail(actor(req), req.params.id)); } catch (error) { next(error); }
};

export const updateAssignment = withCleanup(async (req, res) => {
  const input = updateSchema.parse(req.body);
  await assignmentsService.update(actor(req), req.params.id, input, uploaded(req), input.removeFileIds ?? []);
  res.json({ ok: true });
});

export const deleteAssignment = async (req: Request, res: Response, next: NextFunction) => {
  try { await assignmentsService.remove(actor(req), req.params.id); res.json({ ok: true }); } catch (error) { next(error); }
};

export const gradeSubmission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { marks, feedback } = gradeSchema.parse(req.body);
    await assignmentsService.grade(actor(req), req.params.id, req.params.studentId, marks, feedback ?? null);
    res.json({ ok: true });
  } catch (error) { next(error); }
};

// ---- Students ----

export const listMine = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json({ assignments: await assignmentsService.listForStudent(req.user!.id) }); } catch (error) { next(error); }
};

export const getMine = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await assignmentsService.getForStudent(req.user!.id, req.params.id)); } catch (error) { next(error); }
};

export const submitMine = withCleanup(async (req, res) => {
  const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 5000) : null;
  await assignmentsService.submit(req.user!.id, req.params.id, note, uploaded(req));
  res.json({ ok: true });
});
