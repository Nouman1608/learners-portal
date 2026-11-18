import { sql, eq, and, inArray } from 'drizzle-orm';
import { db } from '../config/database';
import env from '../config/env';
import logger from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { removeStoredFiles, originalName } from '../middleware/assignmentUpload';
import {
  assignments, assignmentStudents, assignmentFiles, assignmentSubmissions, assignmentSubmissionFiles,
} from '../db/schema/assignments';
import emailService from './email.service';
import whatsappService from './whatsapp.service';

/**
 * Assignments: a teacher / admin / sudo posts instructions and files to a class (every student
 * enrolled in it now, also later joiners) or to chosen students. Students upload their answers;
 * the teacher marks them and writes feedback.
 *
 * Teachers work with their own classes and the students enrolled in them; admins and sudo with
 * everyone on their campus.
 */

export interface Actor { id: string; role: string }

export interface AssignmentInput {
  title: string;
  instructions?: string | null;
  dueDate?: string | null; // YYYY-MM-DD
  maxMarks?: string | null;
  courseId?: string | null; // set = the whole class
  studentIds?: string[]; // otherwise these students
}

type UploadedFile = Express.Multer.File;
const fileRow = (file: UploadedFile) => ({
  fileName: originalName(file),
  fileUrl: `/uploads/assignments/${file.filename}`,
  mimeType: file.mimetype || null,
  sizeBytes: file.size ?? null,
});

const isAdmin = (actor: Actor) => actor.role === 'sudo' || actor.role === 'admin';
const num = (value: string | null | undefined) => (value === null || value === undefined ? null : Number(value));

export const assignmentsService = {
  /** Classes a teacher teaches (admins and sudo: all active classes) */
  async myCourseIds(actor: Actor): Promise<string[]> {
    const rows = (await db.execute(isAdmin(actor)
      ? sql`SELECT id FROM courses WHERE is_active = true`
      : sql`SELECT ct.course_id AS id FROM course_teachers ct INNER JOIN courses c ON c.id = ct.course_id AND c.is_active = true WHERE ct.teacher_id = ${actor.id}`)).rows as any[];
    return rows.map((r) => r.id);
  },

  /** For the "post an assignment" form: the actor's classes, each with its students enrolled now */
  async audience(actor: Actor) {
    const rows = (await db.execute(sql`
      SELECT c.id AS "courseId", c.title, u.id AS "studentId", trim(u.first_name || ' ' || u.last_name) AS name
      FROM courses c
      LEFT JOIN enrollments e ON e.course_id = c.id AND e.status = 'active'
      LEFT JOIN users u ON u.id = e.student_id AND u.is_active = true
      WHERE c.is_active = true
        AND ${isAdmin(actor) ? sql`true` : sql`EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = c.id AND ct.teacher_id = ${actor.id})`}
      ORDER BY c.title, u.first_name, u.last_name`)).rows as any[];
    const classes = new Map<string, { courseId: string; title: string; students: { id: string; name: string }[] }>();
    for (const row of rows) {
      const entry: { courseId: string; title: string; students: { id: string; name: string }[] } = classes.get(row.courseId) ?? { courseId: row.courseId, title: row.title, students: [] };
      if (row.studentId) entry.students.push({ id: row.studentId, name: row.name });
      classes.set(row.courseId, entry);
    }
    return [...classes.values()];
  },

  /** Can this actor change / mark this assignment? */
  async assertCanManage(actor: Actor, assignmentId: string) {
    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
    if (!assignment) throw new AppError(404, 'Assignment not found');
    if (isAdmin(actor) || assignment.createdBy === actor.id) return assignment;
    if (assignment.courseId && (await this.myCourseIds(actor)).includes(assignment.courseId)) return assignment;
    throw new AppError(403, 'You can only manage assignments for your own classes');
  },

  /** The students an assignment reaches right now */
  async audienceOf(assignment: { id: string; courseId: string | null }) {
    const rows = (await db.execute(assignment.courseId
      ? sql`SELECT u.id, trim(u.first_name || ' ' || u.last_name) AS name, u.email, u.parent_phone AS "parentPhone"
            FROM enrollments e INNER JOIN users u ON u.id = e.student_id AND u.is_active = true
            WHERE e.course_id = ${assignment.courseId} AND e.status = 'active' ORDER BY u.first_name, u.last_name`
      : sql`SELECT u.id, trim(u.first_name || ' ' || u.last_name) AS name, u.email, u.parent_phone AS "parentPhone"
            FROM assignment_students s INNER JOIN users u ON u.id = s.student_id AND u.is_active = true
            WHERE s.assignment_id = ${assignment.id} ORDER BY u.first_name, u.last_name`)).rows as any[];
    return rows as { id: string; name: string; email: string; parentPhone: string | null }[];
  },

  async list(actor: Actor) {
    const rows = (await db.execute(sql`
      SELECT a.id, a.title, a.due_date AS "dueDate", a.max_marks AS "maxMarks", a.created_at AS "createdAt",
             a.course_id AS "courseId", c.title AS "courseTitle",
             trim(cu.first_name || ' ' || cu.last_name) AS "createdByName",
             (SELECT count(*)::int FROM assignment_files f WHERE f.assignment_id = a.id) AS "fileCount",
             CASE WHEN a.course_id IS NOT NULL
                  THEN (SELECT count(*)::int FROM enrollments e INNER JOIN users su ON su.id = e.student_id AND su.is_active = true
                        WHERE e.course_id = a.course_id AND e.status = 'active')
                  ELSE (SELECT count(*)::int FROM assignment_students s WHERE s.assignment_id = a.id) END AS "audienceCount",
             (SELECT count(*)::int FROM assignment_submissions s WHERE s.assignment_id = a.id) AS "submittedCount",
             (SELECT count(*)::int FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.graded_at IS NOT NULL) AS "gradedCount"
      FROM assignments a
      LEFT JOIN courses c ON c.id = a.course_id
      LEFT JOIN users cu ON cu.id = a.created_by
      WHERE ${isAdmin(actor) ? sql`true` : sql`(a.created_by = ${actor.id} OR EXISTS (
              SELECT 1 FROM course_teachers ct WHERE ct.course_id = a.course_id AND ct.teacher_id = ${actor.id}))`}
      ORDER BY a.created_at DESC`)).rows as any[];
    return rows.map((r) => ({ ...r, maxMarks: num(r.maxMarks) }));
  },

  /** Checks the chosen class / students are the actor's to post to */
  async assertAudience(actor: Actor, input: Pick<AssignmentInput, 'courseId' | 'studentIds'>) {
    if (input.courseId) {
      if (!(await this.myCourseIds(actor)).includes(input.courseId)) throw new AppError(403, 'You can only post to your own classes');
      return;
    }
    const ids = [...new Set(input.studentIds ?? [])];
    if (ids.length === 0) throw new AppError(400, 'Choose a class or at least one student');
    const allowed = new Set((await this.audience(actor)).flatMap((c) => c.students.map((s) => s.id)));
    if (ids.some((id) => !allowed.has(id))) throw new AppError(403, 'You can only post to students enrolled in your own classes');
  },

  async create(actor: Actor, input: AssignmentInput, files: UploadedFile[]) {
    await this.assertAudience(actor, input);
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(assignments).values({
        title: input.title.trim(),
        instructions: input.instructions?.trim() || null,
        courseId: input.courseId || null,
        dueDate: input.dueDate || null,
        maxMarks: input.maxMarks || null,
        createdBy: actor.id,
      }).returning();
      if (!input.courseId) {
        await tx.insert(assignmentStudents).values([...new Set(input.studentIds ?? [])].map((studentId) => ({ assignmentId: row.id, studentId })));
      }
      if (files.length) await tx.insert(assignmentFiles).values(files.map((f) => ({ assignmentId: row.id, ...fileRow(f) })));
      return row;
    });
    void this.notify(actor, created.id).catch((error) => logger.error('[ASSIGNMENT] Notification failed', error));
    return created;
  },

  /** Emails the students (and a WhatsApp template to the parent, when one is set up). Never blocks or fails the post. */
  async notify(actor: Actor, assignmentId: string) {
    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
    if (!assignment) return;
    const [teacher] = (await db.execute(sql`SELECT trim(first_name || ' ' || last_name) AS name FROM users WHERE id = ${actor.id}`)).rows as any[];
    const [course] = assignment.courseId ? (await db.execute(sql`SELECT title FROM courses WHERE id = ${assignment.courseId}`)).rows as any[] : [];
    const link = `${env.FRONTEND_URL.split(',')[0].trim().replace(/\/$/, '')}/my-assignments`;
    const template = process.env.ASSIGNMENT_WHATSAPP_TEMPLATE;
    for (const student of await this.audienceOf(assignment)) {
      await emailService.sendAssignmentEmail({
        to: student.email, studentName: student.name, title: assignment.title, className: course?.title ?? null,
        dueDate: assignment.dueDate, teacherName: teacher?.name ?? 'Your teacher', link,
      });
      if (template && student.parentPhone) {
        try {
          await whatsappService.sendTemplateMessage(student.parentPhone, template, 'en', [student.name, assignment.title, course?.title ?? 'your class']);
        } catch (error: any) {
          logger.warn(`[ASSIGNMENT] WhatsApp to the parent of ${student.name} failed: ${error.message}`);
        }
      }
    }
  },

  async getDetail(actor: Actor, id: string) {
    const assignment = await this.assertCanManage(actor, id);
    const [course] = assignment.courseId ? (await db.execute(sql`SELECT title FROM courses WHERE id = ${assignment.courseId}`)).rows as any[] : [];
    const files = await db.select().from(assignmentFiles).where(eq(assignmentFiles.assignmentId, id));
    const students = await this.audienceOf(assignment);
    const submissions = await db.select().from(assignmentSubmissions).where(eq(assignmentSubmissions.assignmentId, id));
    const submissionFiles = submissions.length
      ? await db.select().from(assignmentSubmissionFiles).where(inArray(assignmentSubmissionFiles.submissionId, submissions.map((s) => s.id)))
      : [];
    return {
      id: assignment.id,
      title: assignment.title,
      instructions: assignment.instructions,
      dueDate: assignment.dueDate,
      maxMarks: num(assignment.maxMarks),
      courseId: assignment.courseId,
      courseTitle: course?.title ?? null,
      createdAt: assignment.createdAt,
      files: files.map((f) => ({ id: f.id, fileName: f.fileName, fileUrl: f.fileUrl, sizeBytes: f.sizeBytes })),
      students: students.map((student) => {
        const s = submissions.find((x) => x.studentId === student.id);
        return {
          id: student.id,
          name: student.name,
          submission: s ? {
            note: s.note, submittedAt: s.submittedAt, marks: num(s.marks), feedback: s.feedback, gradedAt: s.gradedAt,
            files: submissionFiles.filter((f) => f.submissionId === s.id).map((f) => ({ id: f.id, fileName: f.fileName, fileUrl: f.fileUrl, sizeBytes: f.sizeBytes })),
          } : null,
        };
      }),
    };
  },

  async update(actor: Actor, id: string, input: Partial<AssignmentInput>, newFiles: UploadedFile[], removeFileIds: string[]) {
    await this.assertCanManage(actor, id);
    const removed = removeFileIds.length
      ? await db.select().from(assignmentFiles).where(and(eq(assignmentFiles.assignmentId, id), inArray(assignmentFiles.id, removeFileIds)))
      : [];
    await db.transaction(async (tx) => {
      await tx.update(assignments).set({
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions?.trim() || null } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate || null } : {}),
        ...(input.maxMarks !== undefined ? { maxMarks: input.maxMarks || null } : {}),
        updatedAt: new Date(),
      }).where(eq(assignments.id, id));
      if (removed.length) await tx.delete(assignmentFiles).where(inArray(assignmentFiles.id, removed.map((f) => f.id)));
      if (newFiles.length) await tx.insert(assignmentFiles).values(newFiles.map((f) => ({ assignmentId: id, ...fileRow(f) })));
    });
    removeStoredFiles(removed.map((f) => f.fileUrl));
  },

  async remove(actor: Actor, id: string) {
    await this.assertCanManage(actor, id);
    const mine = await db.select({ url: assignmentFiles.fileUrl }).from(assignmentFiles).where(eq(assignmentFiles.assignmentId, id));
    const theirs = (await db.execute(sql`
      SELECT f.file_url AS url FROM assignment_submission_files f
      INNER JOIN assignment_submissions s ON s.id = f.submission_id WHERE s.assignment_id = ${id}`)).rows as any[];
    await db.delete(assignments).where(eq(assignments.id, id)); // files and submissions go with it
    removeStoredFiles([...mine.map((f) => f.url), ...theirs.map((f) => f.url)]);
  },

  async grade(actor: Actor, id: string, studentId: string, marks: string | null, feedback: string | null) {
    const assignment = await this.assertCanManage(actor, id);
    const [submission] = await db.select().from(assignmentSubmissions)
      .where(and(eq(assignmentSubmissions.assignmentId, id), eq(assignmentSubmissions.studentId, studentId))).limit(1);
    if (!submission) throw new AppError(404, 'This student has not submitted yet');
    if (marks !== null && assignment.maxMarks !== null && Number(marks) > Number(assignment.maxMarks)) {
      throw new AppError(400, `Marks cannot be more than ${Number(assignment.maxMarks)}`);
    }
    await db.update(assignmentSubmissions).set({
      marks, feedback: feedback?.trim() || null, gradedBy: actor.id, gradedAt: new Date(),
    }).where(eq(assignmentSubmissions.id, submission.id));
  },

  // ---------------------------------------------------------------- the student's side

  /** Is this assignment one the student is meant to see? */
  async isForStudent(studentId: string, assignmentId: string): Promise<boolean> {
    const rows = (await db.execute(sql`
      SELECT 1 FROM assignments a
      WHERE a.id = ${assignmentId} AND (
        EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = a.course_id AND e.student_id = ${studentId} AND e.status = 'active')
        OR EXISTS (SELECT 1 FROM assignment_students s WHERE s.assignment_id = a.id AND s.student_id = ${studentId}))`)).rows;
    return rows.length > 0;
  },

  async listForStudent(studentId: string) {
    const rows = (await db.execute(sql`
      SELECT a.id, a.title, a.due_date AS "dueDate", a.max_marks AS "maxMarks", a.created_at AS "createdAt",
             c.title AS "courseTitle", trim(cu.first_name || ' ' || cu.last_name) AS "teacherName",
             s.submitted_at AS "submittedAt", s.marks, s.graded_at AS "gradedAt"
      FROM assignments a
      LEFT JOIN courses c ON c.id = a.course_id
      LEFT JOIN users cu ON cu.id = a.created_by
      LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = ${studentId}
      WHERE EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = a.course_id AND e.student_id = ${studentId} AND e.status = 'active')
         OR EXISTS (SELECT 1 FROM assignment_students x WHERE x.assignment_id = a.id AND x.student_id = ${studentId})
      ORDER BY (s.id IS NOT NULL), a.due_date NULLS LAST, a.created_at DESC`)).rows as any[];
    return rows.map((r) => ({ ...r, maxMarks: num(r.maxMarks), marks: num(r.marks) }));
  },

  async getForStudent(studentId: string, id: string) {
    if (!(await this.isForStudent(studentId, id))) throw new AppError(404, 'Assignment not found');
    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
    const [meta] = (await db.execute(sql`
      SELECT c.title AS "courseTitle", trim(u.first_name || ' ' || u.last_name) AS "teacherName"
      FROM assignments a LEFT JOIN courses c ON c.id = a.course_id LEFT JOIN users u ON u.id = a.created_by WHERE a.id = ${id}`)).rows as any[];
    const files = await db.select().from(assignmentFiles).where(eq(assignmentFiles.assignmentId, id));
    const [submission] = await db.select().from(assignmentSubmissions)
      .where(and(eq(assignmentSubmissions.assignmentId, id), eq(assignmentSubmissions.studentId, studentId))).limit(1);
    const myFiles = submission
      ? await db.select().from(assignmentSubmissionFiles).where(eq(assignmentSubmissionFiles.submissionId, submission.id))
      : [];
    return {
      id: assignment.id,
      title: assignment.title,
      instructions: assignment.instructions,
      dueDate: assignment.dueDate,
      maxMarks: num(assignment.maxMarks),
      courseTitle: meta?.courseTitle ?? null,
      teacherName: meta?.teacherName ?? null,
      files: files.map((f) => ({ id: f.id, fileName: f.fileName, fileUrl: f.fileUrl, sizeBytes: f.sizeBytes })),
      submission: submission ? {
        note: submission.note, submittedAt: submission.submittedAt, marks: num(submission.marks), feedback: submission.feedback, gradedAt: submission.gradedAt,
        files: myFiles.map((f) => ({ id: f.id, fileName: f.fileName, fileUrl: f.fileUrl, sizeBytes: f.sizeBytes })),
      } : null,
    };
  },

  /** Hand in (or hand in again): new files replace the earlier ones. Not possible once it has been marked. */
  async submit(studentId: string, id: string, note: string | null, files: UploadedFile[]) {
    if (!(await this.isForStudent(studentId, id))) throw new AppError(404, 'Assignment not found');
    const [existing] = await db.select().from(assignmentSubmissions)
      .where(and(eq(assignmentSubmissions.assignmentId, id), eq(assignmentSubmissions.studentId, studentId))).limit(1);
    if (existing?.gradedAt) throw new AppError(400, 'This has already been marked, so it can no longer be changed');
    if (files.length === 0 && !note?.trim() && !existing) throw new AppError(400, 'Add a file or a note to hand in');

    let replaced: string[] = [];
    await db.transaction(async (tx) => {
      let submissionId = existing?.id;
      if (existing) {
        await tx.update(assignmentSubmissions).set({ note: note?.trim() || null, submittedAt: new Date() }).where(eq(assignmentSubmissions.id, existing.id));
        if (files.length) {
          replaced = (await tx.select({ url: assignmentSubmissionFiles.fileUrl }).from(assignmentSubmissionFiles).where(eq(assignmentSubmissionFiles.submissionId, existing.id))).map((f) => f.url);
          await tx.delete(assignmentSubmissionFiles).where(eq(assignmentSubmissionFiles.submissionId, existing.id));
        }
      } else {
        const [row] = await tx.insert(assignmentSubmissions).values({ assignmentId: id, studentId, note: note?.trim() || null }).returning();
        submissionId = row.id;
      }
      if (files.length) await tx.insert(assignmentSubmissionFiles).values(files.map((f) => ({ submissionId: submissionId!, ...fileRow(f) })));
    });
    removeStoredFiles(replaced);
  },
};

export default assignmentsService;
