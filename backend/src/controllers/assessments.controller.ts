import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { assessmentsService } from '../services/assessments.service';

// Validation schemas
const createAssessmentSchema = z.object({
  courseId: z.string().uuid(),
  teacherId: z.string().uuid().optional(), // Optional - admins can specify, teachers use their own ID
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  maxScore: z.string().regex(/^\d+(\.\d{1,2})?$/),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

const updateAssessmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  maxScore: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

const gradeResultSchema = z.object({
  studentId: z.string().uuid(),
  score: z.string().regex(/^\d+(\.\d{1,2})?$/),
  feedback: z.string().max(5000).optional(),
});

const submitResultSchema = z.object({
  assessmentId: z.string().uuid(),
});

// Assessments
export const createAssessment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createAssessmentSchema.parse(req.body);

    // If user is admin/sudo and provides teacherId, use it; otherwise use current user's ID
    const teacherId = validated.teacherId || req.user!.id;

    const assessment = await assessmentsService.createAssessment({
      ...validated,
      teacherId,
    });
    res.status(201).json({ assessment });
  } catch (error) {
    next(error);
  }
};

export const getAssessments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId, teacherId, isActive } = req.query;

    const filters: any = {
      courseId: courseId as string,
      teacherId: teacherId as string,
    };

    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }

    // If user is a teacher, only show their assessments
    if (req.user?.role === 'teacher') {
      filters.teacherId = req.user.id;
    }

    // If user is a student, only show assessments for courses they're enrolled in
    if (req.user?.role === 'student') {
      filters.studentId = req.user.id;
    }

    const assessments = await assessmentsService.getAssessments(filters);
    res.json({ assessments });
  } catch (error) {
    next(error);
  }
};

export const getAssessmentById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assessment = await assessmentsService.getAssessmentById(req.params.id);
    res.json({ assessment });
  } catch (error) {
    next(error);
  }
};

export const updateAssessment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateAssessmentSchema.parse(req.body);
    const assessment = await assessmentsService.updateAssessment(
      req.params.id,
      req.user!.id, // Teacher ID for authorization
      validated
    );
    res.json({ assessment });
  } catch (error) {
    next(error);
  }
};

export const deleteAssessment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assessmentsService.deleteAssessment(req.params.id, req.user!.id, req.user!.role);
    res.json({ message: 'Assessment deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Results
export const submitResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = submitResultSchema.parse(req.body);
    const result = await assessmentsService.submitResult({
      assessmentId: validated.assessmentId,
      studentId: req.user!.id, // Student submitting
    });
    res.status(201).json({ result });
  } catch (error) {
    next(error);
  }
};

export const gradeResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = gradeResultSchema.parse(req.body);
    const result = await assessmentsService.gradeResult({
      assessmentId: req.params.assessmentId,
      studentId: validated.studentId,
      score: validated.score,
      feedback: validated.feedback,
      gradedBy: req.user!.id,
      userRole: req.user!.role,
    });
    res.json({ result });
  } catch (error) {
    next(error);
  }
};

export const getAssessmentResults = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await assessmentsService.getAssessmentResults(req.params.assessmentId);
    res.json({ results });
  } catch (error) {
    next(error);
  }
};

export const getStudentResults = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = req.query;

    // Students can only view their own results
    const studentId = req.user?.role === 'student' ? req.user.id : req.params.studentId;

    const results = await assessmentsService.getStudentResults(
      studentId,
      courseId as string | undefined
    );
    res.json({ results });
  } catch (error) {
    next(error);
  }
};

export const getResultById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await assessmentsService.getResultById(req.params.id);
    res.json({ result });
  } catch (error) {
    next(error);
  }
};

// Assessment Files
export const uploadAssessmentFiles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { assessmentId } = req.params;

    const files = req.files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      fileUrl: `/uploads/assessments/teacher/${file.filename}`,
      mimeType: file.mimetype,
      fileSize: file.size,
    }));

    const fileType = req.query.fileType as string || 'question_paper';

    const insertedFiles = await assessmentsService.addAssessmentFiles({
      assessmentId,
      files,
      uploadedBy: req.user!.id,
      userRole: req.user!.role,
      fileType,
    });

    res.status(201).json({ files: insertedFiles });
  } catch (error) {
    next(error);
  }
};

export const getAssessmentFiles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fileType = req.query.fileType as string | undefined;

    // If requesting marking scheme, check if deadline has passed (for students)
    if (fileType === 'marking_scheme' && req.user!.role === 'student') {
      const assessment = await assessmentsService.getAssessmentById(req.params.assessmentId);
      if (!assessment) {
        return res.status(404).json({ error: 'Assessment not found' });
      }
      if (new Date() <= new Date(assessment.endTime)) {
        return res.json({ files: [] });
      }
    }

    const files = await assessmentsService.getAssessmentFiles(req.params.assessmentId, fileType);
    res.json({ files });
  } catch (error) {
    next(error);
  }
};

export const deleteAssessmentFile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await assessmentsService.deleteAssessmentFile(req.params.fileId, req.user!.id, req.user!.role);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

// Student Submission
export const submitAssessmentWithPdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { assessmentId } = req.params;

    const result = await assessmentsService.submitResultWithPdf({
      assessmentId,
      studentId: req.user!.id,
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        fileUrl: `/uploads/assessments/submissions/${req.file.filename}`,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      },
    });

    res.status(201).json({ result });
  } catch (error) {
    next(error);
  }
};

export const getSubmissionFile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = await assessmentsService.getSubmissionFile(req.params.resultId);
    res.json({ file });
  } catch (error) {
    next(error);
  }
};

// Annotations
export const saveAnnotations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resultId } = req.params;
    const { annotations } = req.body;

    if (!annotations || !Array.isArray(annotations)) {
      return res.status(400).json({ error: 'Annotations must be an array' });
    }

    const savedAnnotations = await assessmentsService.saveAnnotations({
      resultId,
      teacherId: req.user!.id,
      userRole: req.user!.role,
      annotations,
    });

    res.json({ annotations: savedAnnotations });
  } catch (error) {
    next(error);
  }
};

export const getAnnotations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const annotations = await assessmentsService.getAnnotations(req.params.resultId);
    res.json({ annotations });
  } catch (error) {
    next(error);
  }
};

// Access Check
export const checkAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const canAccess = await assessmentsService.canAccessAssessment(
      req.params.assessmentId,
      req.user!.id
    );
    res.json({ canAccess });
  } catch (error) {
    next(error);
  }
};
