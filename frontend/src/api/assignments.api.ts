import apiClient from './client';

export interface AssignmentFile { id: string; fileName: string; fileUrl: string; sizeBytes: number | null }

export interface AssignmentSummary {
  id: string;
  title: string;
  dueDate: string | null;
  maxMarks: number | null;
  createdAt: string;
  courseId: string | null;
  courseTitle: string | null;
  createdByName: string | null;
  fileCount: number;
  audienceCount: number;
  submittedCount: number;
  gradedCount: number;
}

export interface SubmissionView {
  note: string | null;
  submittedAt: string;
  marks: number | null;
  feedback: string | null;
  gradedAt: string | null;
  files: AssignmentFile[];
}

export interface AssignmentDetail {
  id: string;
  title: string;
  instructions: string | null;
  dueDate: string | null;
  maxMarks: number | null;
  courseId: string | null;
  courseTitle: string | null;
  createdAt: string;
  files: AssignmentFile[];
  students: { id: string; name: string; submission: SubmissionView | null }[];
}

export interface AudienceClass { courseId: string; title: string; students: { id: string; name: string }[] }

export interface MyAssignmentSummary {
  id: string;
  title: string;
  dueDate: string | null;
  maxMarks: number | null;
  createdAt: string;
  courseTitle: string | null;
  teacherName: string | null;
  submittedAt: string | null;
  marks: number | null;
  gradedAt: string | null;
}

export interface MyAssignmentDetail {
  id: string;
  title: string;
  instructions: string | null;
  dueDate: string | null;
  maxMarks: number | null;
  courseTitle: string | null;
  teacherName: string | null;
  files: AssignmentFile[];
  submission: SubmissionView | null;
}

export interface AssignmentFormValues {
  title: string;
  instructions: string;
  dueDate: string;
  maxMarks: string;
  courseId: string; // '' = chosen students
  studentIds: string[];
  files: File[];
  removeFileIds?: string[];
}

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

const toForm = (values: AssignmentFormValues, creating: boolean) => {
  const form = new FormData();
  form.append('title', values.title);
  form.append('instructions', values.instructions);
  form.append('dueDate', values.dueDate);
  form.append('maxMarks', values.maxMarks);
  if (creating) {
    form.append('courseId', values.courseId);
    form.append('studentIds', JSON.stringify(values.studentIds));
  } else {
    form.append('removeFileIds', JSON.stringify(values.removeFileIds ?? []));
  }
  values.files.forEach((file) => form.append('files', file));
  return form;
};

export const assignmentsApi = {
  async audience(): Promise<AudienceClass[]> {
    return (await apiClient.get('/assignments/audience')).data.classes;
  },
  async list(): Promise<AssignmentSummary[]> {
    return (await apiClient.get('/assignments')).data.assignments;
  },
  async get(id: string): Promise<AssignmentDetail> {
    return (await apiClient.get(`/assignments/${id}`)).data;
  },
  async create(values: AssignmentFormValues): Promise<string> {
    return (await apiClient.post('/assignments', toForm(values, true), MULTIPART)).data.id;
  },
  async update(id: string, values: AssignmentFormValues): Promise<void> {
    await apiClient.put(`/assignments/${id}`, toForm(values, false), MULTIPART);
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(`/assignments/${id}`);
  },
  async grade(id: string, studentId: string, marks: string, feedback: string): Promise<void> {
    await apiClient.put(`/assignments/${id}/submissions/${studentId}/grade`, { marks: marks === '' ? null : marks, feedback });
  },

  // Students
  async mine(): Promise<MyAssignmentSummary[]> {
    return (await apiClient.get('/assignments/mine')).data.assignments;
  },
  async mineDetail(id: string): Promise<MyAssignmentDetail> {
    return (await apiClient.get(`/assignments/mine/${id}`)).data;
  },
  async submit(id: string, note: string, files: File[]): Promise<void> {
    const form = new FormData();
    form.append('note', note);
    files.forEach((file) => form.append('files', file));
    await apiClient.post(`/assignments/mine/${id}/submit`, form, MULTIPART);
  },
};

export default assignmentsApi;

/** The server takes at most 10 MB in one upload; say so before sending rather than failing halfway */
export const filesTooBig = (files: File[]): boolean => files.reduce((sum, file) => sum + file.size, 0) > 9.5 * 1024 * 1024;
