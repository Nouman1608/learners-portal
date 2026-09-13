import { db } from '../config/database';
import { assessments, assessmentResults, assessmentFiles, submissionFiles, pdfAnnotations, users, courses, enrollments } from '../db/schema';
import { eq, and, desc, or, isNotNull } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import fs from 'fs';
import path from 'path';

export interface CreateAssessmentInput {
  courseId: string;
  teacherId: string;
  title: string;
  description?: string;
  maxScore: string; // decimal as string
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
}

export interface UpdateAssessmentInput {
  title?: string;
  description?: string;
  maxScore?: string;
  startTime?: string;
  endTime?: string;
  isActive?: boolean;
}

export interface GradeResultInput {
  assessmentId: string;
  studentId: string;
  score: string; // decimal as string
  feedback?: string;
  gradedBy: string;
  userRole: string;
}

export interface SubmitResultInput {
  assessmentId: string;
  studentId: string;
}

export const assessmentsService = {
  /**
   * Create a new assessment
   */
  async createAssessment(input: CreateAssessmentInput) {
    // Verify course exists
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, input.courseId))
      .limit(1);

    if (!course) {
      throw new AppError(404, 'Course not found');
    }

    // Verify teacher exists and is assigned to this course
    const [teacher] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, input.teacherId), eq(users.role, 'teacher')))
      .limit(1);

    if (!teacher) {
      throw new AppError(404, 'Teacher not found');
    }

    // Create assessment
    const [newAssessment] = await db
      .insert(assessments)
      .values({
        courseId: input.courseId,
        teacherId: input.teacherId,
        title: input.title,
        description: input.description || null,
        maxScore: input.maxScore,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        isActive: true,
      })
      .returning();

    return newAssessment;
  },

  /**
   * Get assessments with filtering
   */
  async getAssessments(filters?: {
    courseId?: string;
    teacherId?: string;
    isActive?: boolean;
    studentId?: string;
  }) {
    let query = db
      .select({
        id: assessments.id,
        courseId: assessments.courseId,
        teacherId: assessments.teacherId,
        title: assessments.title,
        description: assessments.description,
        maxScore: assessments.maxScore,
        startTime: assessments.startTime,
        endTime: assessments.endTime,
        isActive: assessments.isActive,
        createdAt: assessments.createdAt,
        course: {
          id: courses.id,
          title: courses.title,
          subject: courses.subject,
        },
        teacher: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(assessments)
      .innerJoin(courses, eq(assessments.courseId, courses.id))
      .innerJoin(users, eq(assessments.teacherId, users.id));

    // If filtering by student, join with enrollments to only show enrolled courses
    if (filters?.studentId) {
      query = query.innerJoin(enrollments, and(
        eq(enrollments.courseId, assessments.courseId),
        eq(enrollments.studentId, filters.studentId)
      )) as any;
    }

    query = query.orderBy(desc(assessments.createdAt)) as any;

    const conditions = [];

    if (filters?.courseId) {
      conditions.push(eq(assessments.courseId, filters.courseId));
    }
    if (filters?.teacherId) {
      conditions.push(eq(assessments.teacherId, filters.teacherId));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(assessments.isActive, filters.isActive));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return results;
  },

  /**
   * Get assessment by ID
   */
  async getAssessmentById(assessmentId: string) {
    const [assessment] = await db
      .select({
        id: assessments.id,
        courseId: assessments.courseId,
        teacherId: assessments.teacherId,
        title: assessments.title,
        description: assessments.description,
        maxScore: assessments.maxScore,
        startTime: assessments.startTime,
        endTime: assessments.endTime,
        isActive: assessments.isActive,
        createdAt: assessments.createdAt,
        course: {
          id: courses.id,
          title: courses.title,
          description: courses.description,
        },
        teacher: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(assessments)
      .innerJoin(courses, eq(assessments.courseId, courses.id))
      .innerJoin(users, eq(assessments.teacherId, users.id))
      .where(eq(assessments.id, assessmentId))
      .limit(1);

    if (!assessment) {
      throw new AppError(404, 'Assessment not found');
    }

    return assessment;
  },

  /**
   * Update an assessment
   */
  async updateAssessment(assessmentId: string, teacherId: string, input: UpdateAssessmentInput) {
    // Verify assessment exists and teacher owns it
    const [existing] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, assessmentId))
      .limit(1);

    if (!existing) {
      throw new AppError(404, 'Assessment not found');
    }

    if (existing.teacherId !== teacherId) {
      throw new AppError(403, 'You can only update your own assessments');
    }

    const updateData: any = {
      ...input,
      updatedAt: new Date(),
    };

    if (input.startTime) {
      updateData.startTime = new Date(input.startTime);
    }
    if (input.endTime) {
      updateData.endTime = new Date(input.endTime);
    }

    const [updatedAssessment] = await db
      .update(assessments)
      .set(updateData)
      .where(eq(assessments.id, assessmentId))
      .returning();

    return updatedAssessment;
  },

  /**
   * Delete an assessment
   */
  async deleteAssessment(assessmentId: string, teacherId: string, userRole: string) {
    // Verify assessment exists and teacher owns it
    const [existing] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, assessmentId))
      .limit(1);

    if (!existing) {
      throw new AppError(404, 'Assessment not found');
    }

    // Allow the assessment creator (teacher) OR admins/sudo to delete
    const isAdmin = userRole === 'admin' || userRole === 'sudo';
    if (existing.teacherId !== teacherId && !isAdmin) {
      throw new AppError(403, 'Only the assessment creator or admins can delete this assessment');
    }

    await db.delete(assessments).where(eq(assessments.id, assessmentId));
  },

  /**
   * Submit an assessment result (student marks as submitted)
   */
  async submitResult(input: SubmitResultInput) {
    // Verify assessment exists
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, input.assessmentId))
      .limit(1);

    if (!assessment) {
      throw new AppError(404, 'Assessment not found');
    }

    // Verify student is enrolled in the course
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, input.studentId),
          eq(enrollments.courseId, assessment.courseId),
          eq(enrollments.status, 'active')
        )
      )
      .limit(1);

    if (!enrollment) {
      throw new AppError(403, 'Student is not enrolled in this course');
    }

    // Check if result already exists
    const [existing] = await db
      .select()
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.assessmentId, input.assessmentId),
          eq(assessmentResults.studentId, input.studentId)
        )
      )
      .limit(1);

    if (existing) {
      // Update submission time
      const [updated] = await db
        .update(assessmentResults)
        .set({
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(assessmentResults.id, existing.id))
        .returning();

      return updated;
    } else {
      // Create new result
      const [newResult] = await db
        .insert(assessmentResults)
        .values({
          assessmentId: input.assessmentId,
          studentId: input.studentId,
          submittedAt: new Date(),
        })
        .returning();

      return newResult;
    }
  },

  /**
   * Grade an assessment result (teacher adds score and feedback)
   */
  async gradeResult(input: GradeResultInput) {
    // Verify assessment exists and grader is the teacher
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, input.assessmentId))
      .limit(1);

    if (!assessment) {
      throw new AppError(404, 'Assessment not found');
    }

    // Allow the assessment creator (teacher) OR admins/sudo to grade
    const isAdmin = input.userRole === 'admin' || input.userRole === 'sudo';
    if (assessment.teacherId !== input.gradedBy && !isAdmin) {
      throw new AppError(403, 'Only the assessment creator or admins can grade it');
    }

    // Verify score is not greater than maxScore
    const score = parseFloat(input.score);
    const maxScore = parseFloat(assessment.maxScore);

    if (score > maxScore) {
      throw new AppError(400, `Score cannot exceed max score of ${maxScore}`);
    }

    // Check if result exists
    const [existing] = await db
      .select()
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.assessmentId, input.assessmentId),
          eq(assessmentResults.studentId, input.studentId)
        )
      )
      .limit(1);

    if (existing) {
      // Update existing result
      const [updated] = await db
        .update(assessmentResults)
        .set({
          score: input.score,
          feedback: input.feedback || null,
          gradedAt: new Date(),
          gradedBy: input.gradedBy,
          updatedAt: new Date(),
        })
        .where(eq(assessmentResults.id, existing.id))
        .returning();

      return updated;
    } else {
      // Create new result with grade
      const [newResult] = await db
        .insert(assessmentResults)
        .values({
          assessmentId: input.assessmentId,
          studentId: input.studentId,
          score: input.score,
          feedback: input.feedback || null,
          gradedAt: new Date(),
          gradedBy: input.gradedBy,
        })
        .returning();

      return newResult;
    }
  },

  /**
   * Get results for an assessment
   */
  async getAssessmentResults(assessmentId: string) {
    const results = await db
      .select({
        id: assessmentResults.id,
        assessmentId: assessmentResults.assessmentId,
        studentId: assessmentResults.studentId,
        score: assessmentResults.score,
        feedback: assessmentResults.feedback,
        submittedAt: assessmentResults.submittedAt,
        gradedAt: assessmentResults.gradedAt,
        createdAt: assessmentResults.createdAt,
        student: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(assessmentResults)
      .innerJoin(users, eq(assessmentResults.studentId, users.id))
      .where(eq(assessmentResults.assessmentId, assessmentId))
      .orderBy(desc(assessmentResults.createdAt));

    return results;
  },

  /**
   * Get student's results (for a specific student)
   */
  async getStudentResults(studentId: string, courseId?: string) {
    const conditions = [eq(assessmentResults.studentId, studentId)];
    if (courseId) {
      conditions.push(eq(assessments.courseId, courseId));
    }

    const results = await db
      .select({
        id: assessmentResults.id,
        assessmentId: assessmentResults.assessmentId,
        studentId: assessmentResults.studentId,
        score: assessmentResults.score,
        feedback: assessmentResults.feedback,
        submittedAt: assessmentResults.submittedAt,
        gradedAt: assessmentResults.gradedAt,
        createdAt: assessmentResults.createdAt,
        assessment: {
          id: assessments.id,
          title: assessments.title,
          description: assessments.description,
          maxScore: assessments.maxScore,
          startTime: assessments.startTime,
          endTime: assessments.endTime,
          courseId: assessments.courseId,
        },
        course: {
          id: courses.id,
          title: courses.title,
          subject: courses.subject,
        },
      })
      .from(assessmentResults)
      .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
      .innerJoin(courses, eq(assessments.courseId, courses.id))
      .where(and(...conditions))
      .orderBy(desc(assessmentResults.createdAt));

    return results;
  },

  /**
   * Get result by ID
   */
  async getResultById(resultId: string) {
    const [result] = await db
      .select({
        id: assessmentResults.id,
        assessmentId: assessmentResults.assessmentId,
        studentId: assessmentResults.studentId,
        score: assessmentResults.score,
        feedback: assessmentResults.feedback,
        submittedAt: assessmentResults.submittedAt,
        gradedAt: assessmentResults.gradedAt,
        createdAt: assessmentResults.createdAt,
        assessment: {
          id: assessments.id,
          title: assessments.title,
          description: assessments.description,
          maxScore: assessments.maxScore,
          startTime: assessments.startTime,
          endTime: assessments.endTime,
        },
        student: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(assessmentResults)
      .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
      .innerJoin(users, eq(assessmentResults.studentId, users.id))
      .where(eq(assessmentResults.id, resultId))
      .limit(1);

    if (!result) {
      throw new AppError(404, 'Result not found');
    }

    return result;
  },

  /**
   * Add PDF files to an assessment (teacher question papers)
   */
  async addAssessmentFiles(input: {
    assessmentId: string;
    files: Array<{
      filename: string;
      originalName: string;
      fileUrl: string;
      mimeType: string;
      fileSize: number;
    }>;
    uploadedBy: string;
    userRole: string;
    fileType?: string;
  }) {
    // Verify assessment exists and teacher owns it
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, input.assessmentId))
      .limit(1);

    if (!assessment) {
      throw new AppError(404, 'Assessment not found');
    }

    // Allow the assessment creator (teacher) OR admins/sudo to upload files
    const isAdmin = input.userRole === 'admin' || input.userRole === 'sudo';
    if (assessment.teacherId !== input.uploadedBy && !isAdmin) {
      throw new AppError(403, 'Only the assessment creator or admins can upload files');
    }

    // Get current max display order
    const result = await db
      .select({ maxOrder: assessmentFiles.displayOrder })
      .from(assessmentFiles)
      .where(eq(assessmentFiles.assessmentId, input.assessmentId))
      .orderBy(desc(assessmentFiles.displayOrder))
      .limit(1);

    let displayOrder = (result[0]?.maxOrder || 0) + 1;

    // Insert files
    const insertedFiles = [];
    for (const file of input.files) {
      const [inserted] = await db
        .insert(assessmentFiles)
        .values({
          assessmentId: input.assessmentId,
          filename: file.filename,
          originalName: file.originalName,
          fileUrl: file.fileUrl,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          fileType: input.fileType || 'question_paper',
          uploadedBy: input.uploadedBy,
          displayOrder: displayOrder++,
        })
        .returning();
      insertedFiles.push(inserted);
    }

    return insertedFiles;
  },

  /**
   * Get assessment files (question papers and/or marking schemes)
   */
  async getAssessmentFiles(assessmentId: string, fileType?: string) {
    const conditions = [eq(assessmentFiles.assessmentId, assessmentId)];
    if (fileType) {
      conditions.push(eq(assessmentFiles.fileType, fileType));
    }

    const files = await db
      .select()
      .from(assessmentFiles)
      .where(and(...conditions))
      .orderBy(assessmentFiles.displayOrder);

    return files;
  },

  /**
   * Delete an assessment file
   */
  async deleteAssessmentFile(fileId: string, userId: string, userRole: string) {
    const result = await db
      .select({
        file: assessmentFiles,
        assessment: assessments,
      })
      .from(assessmentFiles)
      .innerJoin(assessments, eq(assessmentFiles.assessmentId, assessments.id))
      .where(eq(assessmentFiles.id, fileId))
      .limit(1);

    if (result.length === 0) {
      throw new AppError(404, 'File not found');
    }

    const { file, assessment } = result[0];

    // Allow the assessment creator (teacher) OR admins/sudo to delete files
    const isAdmin = userRole === 'admin' || userRole === 'sudo';
    if (assessment.teacherId !== userId && !isAdmin) {
      throw new AppError(403, 'Only the assessment creator or admins can delete files');
    }

    // Delete from database
    await db.delete(assessmentFiles).where(eq(assessmentFiles.id, fileId));

    // Delete physical file
    const filePath = path.join(process.cwd(), file.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return { message: 'File deleted successfully' };
  },

  /**
   * Submit assessment result with PDF
   */
  async submitResultWithPdf(input: {
    assessmentId: string;
    studentId: string;
    file: {
      filename: string;
      originalName: string;
      fileUrl: string;
      mimeType: string;
      fileSize: number;
    };
  }) {
    // Verify assessment exists
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, input.assessmentId))
      .limit(1);

    if (!assessment) {
      throw new AppError(404, 'Assessment not found');
    }

    // Check access time - student must submit before endTime
    const now = new Date();
    if (now < new Date(assessment.startTime)) {
      throw new AppError(403, 'Assessment has not started yet');
    }
    if (now > new Date(assessment.endTime)) {
      throw new AppError(403, 'Assessment deadline has passed');
    }

    // Verify student is enrolled
    const [enrollment] = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, input.studentId),
          eq(enrollments.courseId, assessment.courseId),
          eq(enrollments.status, 'active')
        )
      )
      .limit(1);

    if (!enrollment) {
      throw new AppError(403, 'Student is not enrolled in this course');
    }

    // Check if result already exists
    const [existingResult] = await db
      .select()
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.assessmentId, input.assessmentId),
          eq(assessmentResults.studentId, input.studentId)
        )
      )
      .limit(1);

    let resultId: string;

    if (existingResult) {
      // Update submission time
      await db
        .update(assessmentResults)
        .set({
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(assessmentResults.id, existingResult.id));

      resultId = existingResult.id;

      // Delete old submission file if exists
      await db
        .delete(submissionFiles)
        .where(eq(submissionFiles.resultId, resultId));
    } else {
      // Create new result
      const [newResult] = await db
        .insert(assessmentResults)
        .values({
          assessmentId: input.assessmentId,
          studentId: input.studentId,
          submittedAt: new Date(),
        })
        .returning();

      resultId = newResult.id;
    }

    // Insert submission file
    const [submissionFile] = await db
      .insert(submissionFiles)
      .values({
        resultId,
        filename: input.file.filename,
        originalName: input.file.originalName,
        fileUrl: input.file.fileUrl,
        mimeType: input.file.mimeType,
        fileSize: input.file.fileSize,
      })
      .returning();

    return { resultId, submissionFile };
  },

  /**
   * Get submission file for a result
   */
  async getSubmissionFile(resultId: string) {
    const [file] = await db
      .select()
      .from(submissionFiles)
      .where(eq(submissionFiles.resultId, resultId))
      .limit(1);

    return file;
  },

  /**
   * Save PDF annotations
   */
  async saveAnnotations(input: {
    resultId: string;
    teacherId: string;
    userRole: string;
    annotations: Array<{
      pageNumber: number;
      annotationType: string;
      annotationData: any;
    }>;
  }) {
    // Verify result exists and teacher owns the assessment
    const result = await db
      .select({
        result: assessmentResults,
        assessment: assessments,
      })
      .from(assessmentResults)
      .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
      .where(eq(assessmentResults.id, input.resultId))
      .limit(1);

    if (result.length === 0) {
      throw new AppError(404, 'Result not found');
    }

    // Allow the assessment creator (teacher) OR admins/sudo to add annotations
    const isAdmin = input.userRole === 'admin' || input.userRole === 'sudo';
    if (result[0].assessment.teacherId !== input.teacherId && !isAdmin) {
      throw new AppError(403, 'Only the assessment creator or admins can add annotations');
    }

    // Delete existing annotations for this result (replace mode)
    await db
      .delete(pdfAnnotations)
      .where(eq(pdfAnnotations.resultId, input.resultId));

    // Insert new annotations
    const insertedAnnotations = [];
    for (const annotation of input.annotations) {
      const [inserted] = await db
        .insert(pdfAnnotations)
        .values({
          resultId: input.resultId,
          teacherId: input.teacherId,
          pageNumber: annotation.pageNumber,
          annotationType: annotation.annotationType,
          annotationData: annotation.annotationData,
        })
        .returning();
      insertedAnnotations.push(inserted);
    }

    return insertedAnnotations;
  },

  /**
   * Get annotations for a result
   */
  async getAnnotations(resultId: string) {
    const annotations = await db
      .select()
      .from(pdfAnnotations)
      .where(eq(pdfAnnotations.resultId, resultId))
      .orderBy(pdfAnnotations.pageNumber, pdfAnnotations.createdAt);

    return annotations;
  },

  /**
   * Check if student can access assessment files
   */
  async canAccessAssessment(assessmentId: string, studentId: string): Promise<boolean> {
    const [assessment] = await db
      .select()
      .from(assessments)
      .where(eq(assessments.id, assessmentId))
      .limit(1);

    if (!assessment) {
      return false;
    }

    const now = new Date();

    // Check if student has submitted
    const hasSubmitted = await db
      .select()
      .from(assessmentResults)
      .where(
        and(
          eq(assessmentResults.assessmentId, assessmentId),
          eq(assessmentResults.studentId, studentId),
          isNotNull(assessmentResults.submittedAt)
        )
      )
      .limit(1);

    // Rule: Can access if (1) time is between start and end, OR (2) has submitted
    return (
      (now >= new Date(assessment.startTime) && now <= new Date(assessment.endTime)) ||
      hasSubmitted.length > 0
    );
  },
};

export default assessmentsService;
