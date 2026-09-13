import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import { AppError } from './errorHandler';
import fs from 'fs';

// Get upload directory from environment variable or use default
// On production, set UPLOAD_DIR to a writable location like /var/uploads/learners-academy
const baseUploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

// Create assessment-specific upload directories
const assessmentUploadsDir = path.join(baseUploadDir, 'assessments');
const teacherUploadsDir = path.join(assessmentUploadsDir, 'teacher');
const studentUploadsDir = path.join(assessmentUploadsDir, 'submissions');

// Ensure directories exist
[assessmentUploadsDir, teacherUploadsDir, studentUploadsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure storage for teacher question papers
const teacherStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, teacherUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${req.user?.id || 'anonymous'}`;
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_');
    cb(null, `teacher-${basename}-${uniqueSuffix}${ext}`);
  },
});

// Configure storage for student submissions
const studentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, studentUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${req.user?.id || 'anonymous'}`;
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_');
    cb(null, `student-${basename}-${uniqueSuffix}${ext}`);
  },
});

// File filter - ONLY PDFs
const pdfOnlyFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new AppError(400, 'Only PDF files are allowed for assessments'));
  }
};

// Configure multer for teacher uploads
export const teacherPdfUpload = multer({
  storage: teacherStorage,
  fileFilter: pdfOnlyFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max for teacher PDFs
  },
});

// Configure multer for student uploads
export const studentPdfUpload = multer({
  storage: studentStorage,
  fileFilter: pdfOnlyFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max for student submissions
  },
});

export const uploadTeacherPdfs = (maxCount: number = 5) => {
  return teacherPdfUpload.array('files', maxCount);
};

export const uploadStudentPdf = () => {
  return studentPdfUpload.single('file');
};
