import apiClient from './client';

export interface Assessment {
  id: string;
  courseId: string;
  teacherId: string;
  title: string;
  description?: string;
  maxScore: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  course: {
    id: string;
    title: string;
    description?: string;
  };
  teacher: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
}

export interface AssessmentResult {
  id: string;
  assessmentId: string;
  studentId: string;
  score?: string;
  feedback?: string;
  submittedAt?: string;
  gradedAt?: string;
  createdAt: string;
  assessment?: {
    id: string;
    title: string;
    description?: string;
    maxScore: string;
    startTime: string;
    endTime: string;
    courseId?: string;
  };
  student?: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  course?: {
    id: string;
    title: string;
    subject?: string | null;
  };
}

export interface CreateAssessmentInput {
  courseId: string;
  teacherId?: string; // Optional - admins can specify, teachers use their own ID
  title: string;
  description?: string;
  maxScore: string;
  startTime: string;
  endTime: string;
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
  studentId: string;
  score: string;
  feedback?: string;
}

export interface SubmitResultInput {
  assessmentId: string;
}

export interface AssessmentFile {
  id: string;
  assessmentId: string;
  filename: string;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  fileType: string;
  uploadedBy: string;
  displayOrder: number;
  createdAt: string;
}

export interface SubmissionFile {
  id: string;
  resultId: string;
  filename: string;
  originalName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface Annotation {
  id: string;
  resultId: string;
  teacherId: string;
  pageNumber: number;
  annotationType: string;
  annotationData: any;
  createdAt: string;
  updatedAt: string;
}

export const assessmentsApi = {
  // Assessments CRUD
  getAssessments: async (filters?: {
    courseId?: string;
    teacherId?: string;
    isActive?: boolean;
  }): Promise<Assessment[]> => {
    const params = new URLSearchParams();
    if (filters?.courseId) params.append('courseId', filters.courseId);
    if (filters?.teacherId) params.append('teacherId', filters.teacherId);
    if (filters?.isActive !== undefined) params.append('isActive', filters.isActive.toString());

    const response = await apiClient.get<{ assessments: Assessment[] }>(
      `/assessments?${params.toString()}`
    );
    return response.data.assessments;
  },

  getAssessmentById: async (id: string): Promise<Assessment> => {
    const response = await apiClient.get<{ assessment: Assessment }>(`/assessments/${id}`);
    return response.data.assessment;
  },

  createAssessment: async (data: CreateAssessmentInput): Promise<Assessment> => {
    const response = await apiClient.post<{ assessment: Assessment }>('/assessments', data);
    return response.data.assessment;
  },

  updateAssessment: async (id: string, data: UpdateAssessmentInput): Promise<Assessment> => {
    const response = await apiClient.patch<{ assessment: Assessment }>(`/assessments/${id}`, data);
    return response.data.assessment;
  },

  deleteAssessment: async (id: string): Promise<void> => {
    await apiClient.delete(`/assessments/${id}`);
  },

  // Results
  submitResult: async (data: SubmitResultInput): Promise<AssessmentResult> => {
    const response = await apiClient.post<{ result: AssessmentResult }>('/assessments/results/submit', data);
    return response.data.result;
  },

  gradeResult: async (assessmentId: string, data: GradeResultInput): Promise<AssessmentResult> => {
    const response = await apiClient.post<{ result: AssessmentResult }>(
      `/assessments/${assessmentId}/grade`,
      data
    );
    return response.data.result;
  },

  getAssessmentResults: async (assessmentId: string): Promise<AssessmentResult[]> => {
    const response = await apiClient.get<{ results: AssessmentResult[] }>(
      `/assessments/${assessmentId}/results`
    );
    return response.data.results;
  },

  getStudentResults: async (studentId?: string, courseId?: string): Promise<AssessmentResult[]> => {
    const params = new URLSearchParams();
    if (courseId) params.append('courseId', courseId);

    const endpoint = studentId
      ? `/assessments/results/student/${studentId}?${params.toString()}`
      : `/assessments/results/my-results?${params.toString()}`;

    const response = await apiClient.get<{ results: AssessmentResult[] }>(endpoint);
    return response.data.results;
  },

  getResultById: async (id: string): Promise<AssessmentResult> => {
    const response = await apiClient.get<{ result: AssessmentResult }>(`/assessments/results/${id}`);
    return response.data.result;
  },

  // Assessment Files (Teacher question papers)
  uploadAssessmentFiles: async (assessmentId: string, files: File[], fileType: string = 'question_paper'): Promise<AssessmentFile[]> => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    const response = await apiClient.post<{ files: AssessmentFile[] }>(
      `/assessments/${assessmentId}/files?fileType=${fileType}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data.files;
  },

  getAssessmentFiles: async (assessmentId: string, fileType?: string): Promise<AssessmentFile[]> => {
    const params = fileType ? `?fileType=${fileType}` : '';
    const response = await apiClient.get<{ files: AssessmentFile[] }>(
      `/assessments/${assessmentId}/files${params}`
    );
    return response.data.files;
  },

  deleteAssessmentFile: async (fileId: string): Promise<void> => {
    await apiClient.delete(`/assessments/files/${fileId}`);
  },

  // Student Submission
  submitAssessmentWithPdf: async (assessmentId: string, file: File): Promise<AssessmentResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<{ result: AssessmentResult }>(
      `/assessments/${assessmentId}/submit`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data.result;
  },

  getSubmissionFile: async (resultId: string): Promise<SubmissionFile> => {
    const response = await apiClient.get<{ file: SubmissionFile }>(
      `/assessments/results/${resultId}/submission`
    );
    return response.data.file;
  },

  // Annotations
  saveAnnotations: async (resultId: string, annotations: any[]): Promise<Annotation[]> => {
    const response = await apiClient.post<{ annotations: Annotation[] }>(
      `/assessments/results/${resultId}/annotations`,
      { annotations }
    );
    return response.data.annotations;
  },

  getAnnotations: async (resultId: string): Promise<Annotation[]> => {
    const response = await apiClient.get<{ annotations: Annotation[] }>(
      `/assessments/results/${resultId}/annotations`
    );
    return response.data.annotations;
  },

  // Access Check
  checkAccess: async (assessmentId: string): Promise<boolean> => {
    const response = await apiClient.get<{ canAccess: boolean }>(
      `/assessments/${assessmentId}/check-access`
    );
    return response.data.canAccess;
  },
};

export default assessmentsApi;
