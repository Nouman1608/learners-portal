import apiClient from './client';

export type CurrencyCode = 'PKR' | 'USD' | 'GBP' | 'SAR';

export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  enrolledAt: string;
  status: 'active' | 'completed' | 'dropped';
  attendanceMode: 'local' | 'online';
  classType?: 'online' | 'local' | 'hybrid' | '1-to-1';
  customFeePerMonth?: string;
  perSessionFee?: string; // For 1-to-1 classes
  expectedClassesPerMonth?: number;
  currency: CurrencyCode;
  feeType: 'custom' | 'scholarship';
  prorateFirstMonth?: boolean;
  feeNotes?: string;
  startDate?: string;
  endDate?: string;
  completedAt?: string;
  droppedAt?: string;
  willReturnAfterDrop?: boolean;
  tentativeReturnDate?: string;
  student: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    parentPhone?: string;
  };
  course: {
    id: string;
    title: string;
    description?: string;
    duration: number;
    teachers?: Array<{
      id: string;
      firstName: string;
      lastName: string;
    }>;
  };
}

export interface Fee {
  id: string;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  month: number;
  year: number;
  amount: string;
  currency: CurrencyCode;
  dueDate: string;
  status: 'pending' | 'overdue' | 'received';
  receivedAt?: string;
  serialNumber?: string;
  billingType?: 'monthly' | 'usage' | 'catch-up';
  isCatchUp?: boolean;
  feeNotes?: string;
  sessionCount?: number;
  createdAt: string;
  student: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    parentPhone?: string;
    studentCategory?: string;
    studentSubcategory?: string;
  };
  course: {
    id: string;
    title: string;
  };
  payments?: Payment[];
}

export interface Payment {
  id: string;
  feeId: string;
  studentId: string;
  amount: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'jazzcash' | 'easypaisa' | 'payfast' | 'other';
  transactionId?: string;
  paymentDate: string;
  proofUrl?: string;
  notes?: string;
  createdAt: string;
  student?: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  };
  fee?: {
    id: string;
    month: number;
    year: number;
    amount: string;
    status: string;
  };
}

export interface CreateEnrollmentInput {
  studentId: string;
  courseId: string;
  enrolledAt?: string; // Enrollment date (YYYY-MM-DD)
  attendanceMode?: 'local' | 'online';
  classType?: 'online' | 'local' | 'hybrid' | '1-to-1';
  customFeePerMonth?: string; // Required for non-1-to-1 classes
  perSessionFee?: string; // Required for 1-to-1 classes
  expectedClassesPerMonth?: number; // Expected sessions/month for 1-to-1 (used for projected fee)
  currency?: CurrencyCode; // Only for online students, defaults to PKR
  feeType?: 'custom' | 'scholarship';
  prorateFirstMonth?: boolean; // Pro-rate first month to sync billing to the 1st
  feeNotes?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateEnrollmentInput {
  status?: 'active' | 'completed' | 'dropped';
  enrolledAt?: string; // Enrollment date (YYYY-MM-DD)
  completedAt?: string;
  startDate?: string;
  endDate?: string;
  droppedAt?: string;
  willReturnAfterDrop?: boolean;
  tentativeReturnDate?: string;
}

export interface UpdateEnrollmentFeeInput {
  customFeePerMonth?: string;
  perSessionFee?: string;
  expectedClassesPerMonth?: number | null; // null clears
  currency?: CurrencyCode;
  feeType?: 'custom' | 'scholarship';
  prorateFirstMonth?: boolean;
  feeNotes?: string; // '' clears
}

export interface CreateFeeInput {
  enrollmentId: string;
  month: number;
  year: number;
  dueDate: string;
}

export interface UpdateFeeStatusInput {
  status: 'pending' | 'overdue' | 'received';
  receivedBy?: string;
}

export interface CreatePaymentInput {
  feeId: string;
  amount: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'jazzcash' | 'easypaisa' | 'payfast' | 'other';
  transactionId?: string;
  paymentDate: string;
  proofUrl?: string;
  notes?: string;
}

export interface MarkAsReceivedInput {
  paymentMethod: 'online' | 'cash';
  serialNumber?: string;
}

export const enrollmentsApi = {
  // Enrollments
  getEnrollments: async (filters?: {
    studentId?: string;
    courseId?: string;
    status?: string;
  }): Promise<Enrollment[]> => {
    const params = new URLSearchParams();
    if (filters?.studentId) params.append('studentId', filters.studentId);
    if (filters?.courseId) params.append('courseId', filters.courseId);
    if (filters?.status) params.append('status', filters.status);

    const response = await apiClient.get<{ enrollments: Enrollment[] }>(
      `/enrollments?${params.toString()}`
    );
    return response.data.enrollments;
  },

  getEnrollmentById: async (id: string): Promise<Enrollment> => {
    const response = await apiClient.get<{ enrollment: Enrollment }>(`/enrollments/${id}`);
    return response.data.enrollment;
  },

  createEnrollment: async (data: CreateEnrollmentInput): Promise<Enrollment> => {
    const response = await apiClient.post<{ enrollment: Enrollment }>('/enrollments', data);
    return response.data.enrollment;
  },

  updateEnrollment: async (id: string, data: UpdateEnrollmentInput): Promise<Enrollment> => {
    const response = await apiClient.patch<{ enrollment: Enrollment }>(`/enrollments/${id}`, data);
    return response.data.enrollment;
  },

  updateEnrollmentFee: async (id: string, data: UpdateEnrollmentFeeInput): Promise<Enrollment> => {
    const response = await apiClient.patch<{ enrollment: Enrollment; message: string }>(`/enrollments/${id}/fee`, data);
    return response.data.enrollment;
  },

  deleteEnrollment: async (id: string): Promise<void> => {
    await apiClient.delete(`/enrollments/${id}`);
  },

  hardDeleteEnrollment: async (id: string): Promise<{
    message: string;
    details: {
      enrollmentId: string;
      studentName: string;
      courseName: string;
      feesDeleted: number;
      feesRegenerated: number;
      studentInvoicesRegenerated: number;
      teacherInvoicesRegenerated: number;
      affectedPeriods: string[];
    };
  }> => {
    const response = await apiClient.delete<{
      message: string;
      details: any;
    }>(`/enrollments/${id}/hard`);
    return response.data;
  },

  getStudentEnrollments: async (studentId: string): Promise<Enrollment[]> => {
    const response = await apiClient.get<{ enrollments: Enrollment[] }>(
      `/enrollments/student/${studentId}`
    );
    return response.data.enrollments;
  },

  getCourseEnrollments: async (courseId: string): Promise<Enrollment[]> => {
    const response = await apiClient.get<{ enrollments: Enrollment[] }>(
      `/enrollments/course/${courseId}`
    );
    return response.data.enrollments;
  },
};

export const feesApi = {
  // Fees
  getFees: async (filters?: {
    studentId?: string;
    courseId?: string;
    status?: string;
    month?: number;
    year?: number;
  }): Promise<Fee[]> => {
    const params = new URLSearchParams();
    if (filters?.studentId) params.append('studentId', filters.studentId);
    if (filters?.courseId) params.append('courseId', filters.courseId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.month) params.append('month', filters.month.toString());
    if (filters?.year) params.append('year', filters.year.toString());

    const response = await apiClient.get<{ fees: Fee[] }>(
      `/fees?${params.toString()}`
    );
    return response.data.fees;
  },

  getFeeById: async (id: string): Promise<Fee> => {
    const response = await apiClient.get<{ fee: Fee }>(`/fees/${id}`);
    return response.data.fee;
  },

  createFee: async (data: CreateFeeInput): Promise<Fee> => {
    const response = await apiClient.post<{ fee: Fee }>('/fees', data);
    return response.data.fee;
  },

  updateFeeStatus: async (id: string, data: UpdateFeeStatusInput): Promise<Fee> => {
    const response = await apiClient.patch<{ fee: Fee }>(`/fees/${id}/status`, data);
    return response.data.fee;
  },

  markFeeAsReceived: async (id: string, data: MarkAsReceivedInput): Promise<Fee> => {
    const response = await apiClient.patch<{ fee: Fee }>(`/fees/${id}/received`, data);
    return response.data.fee;
  },

  updateFeeSessions: async (id: string, sessionCount: number): Promise<{ message: string; deleted: boolean }> => {
    const response = await apiClient.patch<{ message: string; deleted: boolean }>(`/fees/${id}/sessions`, { sessionCount });
    return response.data;
  },

  getStudentFees: async (studentId: string): Promise<Fee[]> => {
    const response = await apiClient.get<{ fees: Fee[] }>(`/fees/student/${studentId}`);
    return response.data.fees;
  },

  getOverdueFees: async (): Promise<Fee[]> => {
    const response = await apiClient.get<{ fees: Fee[] }>('/fees/overdue');
    return response.data.fees;
  },

  generateFeesManually: async (month: number, year: number): Promise<any> => {
    const response = await apiClient.post('/fees/generate/manual', { month, year });
    return response.data;
  },
};

export const paymentsApi = {
  // Payments
  getPayments: async (filters?: {
    studentId?: string;
    feeId?: string;
  }): Promise<Payment[]> => {
    const params = new URLSearchParams();
    if (filters?.studentId) params.append('studentId', filters.studentId);
    if (filters?.feeId) params.append('feeId', filters.feeId);

    const response = await apiClient.get<{ payments: Payment[] }>(
      `/fees/payments?${params.toString()}`
    );
    return response.data.payments;
  },

  createPayment: async (data: CreatePaymentInput): Promise<Payment> => {
    const response = await apiClient.post<{ payment: Payment }>('/fees/payments', data);
    return response.data.payment;
  },

  getPaymentById: async (id: string): Promise<Payment> => {
    const response = await apiClient.get<{ payment: Payment }>(`/fees/payments/${id}`);
    return response.data.payment;
  },

  getStudentPayments: async (studentId: string): Promise<Payment[]> => {
    const response = await apiClient.get<{ payments: Payment[] }>(
      `/fees/payments/student/${studentId}`
    );
    return response.data.payments;
  },
};

export default { enrollmentsApi, feesApi, paymentsApi };
