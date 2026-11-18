import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request } from 'express';
import { AppError } from './errorHandler';

/**
 * Files for assignments (the teacher's worksheet and the students' answers). Stored under
 * uploads/assignments with a random name, so what a student called the file never decides where
 * it lands. Photos of handwritten work, PDFs and Office documents are allowed.
 */
const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
export const assignmentsDir = path.join(uploadsDir, 'assignments');
fs.mkdirSync(assignmentsDir, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.zip',
]);

export const MAX_ASSIGNMENT_FILES = 5;
export const MAX_ASSIGNMENT_FILE_BYTES = 10 * 1024 * 1024; // nginx allows 10 MB per request on both portals

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, assignmentsDir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_EXTENSIONS.has(path.extname(file.originalname).toLowerCase())) return cb(null, true);
  cb(new AppError(400, 'This file type is not allowed. Use PDF, images, Word, Excel, PowerPoint, text or zip files.'));
};

export const uploadAssignmentFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_ASSIGNMENT_FILE_BYTES, files: MAX_ASSIGNMENT_FILES },
}).array('files', MAX_ASSIGNMENT_FILES);

/** multer reads the uploaded file name as latin1; this gives back the real (UTF-8) name */
export const originalName = (file: Express.Multer.File): string =>
  Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 255);

/** Removes files from disk (a failed request, a replaced or deleted file). Never throws. */
export const removeStoredFiles = (urls: string[]) => {
  for (const url of urls) {
    if (!url.startsWith('/uploads/assignments/')) continue;
    fs.promises.unlink(path.join(assignmentsDir, path.basename(url))).catch(() => undefined);
  }
};
