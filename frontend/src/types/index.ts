export type Role = 'sudo' | 'admin' | 'teacher' | 'student';

export interface User {
  id: string;
  username: string;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  parentPhone?: string;
  studentCategory?: string; // 'junior' or 'senior'
  studentSubcategory?: string; // 'aitchison', 'preschool', 'summer_camp', 'academy', 'local', 'online'
  whatsappGroupLink?: string;
  teamsUsername?: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  // Teacher fee configuration
  teacherPaymentType?: string; // 'percentage_based' or 'salaried'
  localStudentFeePercentage?: string;
  onlineStudentFixedAmountIg?: string;
  onlineStudentFixedAmountAlevel?: string;
  monthlySalary?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
}

export interface ApiError {
  error: string;
  details?: any;
}
