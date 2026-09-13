export type Role = 'sudo' | 'admin' | 'teacher' | 'student';

export type FeeStatus = 'pending' | 'overdue' | 'submitted' | 'received';

export type EnrollmentStatus = 'active' | 'completed' | 'dropped';

export type EventStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';

export type AssessmentType = 'quiz' | 'assignment';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'jazzcash' | 'easypaisa' | 'payfast' | 'other';

export type InvoiceType = 'student' | 'teacher';

export type MeetingPlatform = 'teams' | 'jitsi' | 'daily';

export type RecurrenceType = 'weekly' | 'biweekly' | 'monthly';
