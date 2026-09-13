import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { enrollmentsApi, CreateEnrollmentInput, CurrencyCode } from '../../api/enrollments.api';
import { usersApi, User } from '../../api/users.api';
import { coursesApi, Course } from '../../api/courses.api';
import SearchableSelect from '../common/SearchableSelect';
import toast from 'react-hot-toast';
import LoadingSpinner from '../common/LoadingSpinner';

const enrollmentSchema = z.object({
  studentId: z.string().uuid('Please select a student'),
  courseId: z.string().uuid('Please select a course'),
  enrolledAt: z.string().optional(),
  attendanceMode: z.enum(['local', 'online']).optional(),
  classType: z.enum(['online', 'hybrid', '1-to-1']).optional(),
  currency: z.enum(['PKR', 'USD', 'GBP', 'SAR']).optional(),
  feeType: z.enum(['custom', 'scholarship']).optional(),
  prorateFirstMonth: z.boolean().optional(),
  customFeePerMonth: z.string().optional(),
  perSessionFee: z.string().optional(),
  expectedClassesPerMonth: z.string().optional(),
  feeNotes: z.string().max(1000).optional(),
  startDate: z.string().min(1, 'Start date is required').regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  endDate: z.string().optional(),
}).refine((data) => {
  // For 1-to-1 classes, perSessionFee is required
  if (data.classType === '1-to-1') {
    return !!data.perSessionFee && /^\d+(\.\d{1,2})?$/.test(data.perSessionFee);
  }
  // For other classes, customFeePerMonth is required
  return !!data.customFeePerMonth && /^\d+(\.\d{1,2})?$/.test(data.customFeePerMonth);
}, {
  message: 'Valid fee amount is required',
  path: ['customFeePerMonth'],
});

type EnrollmentFormData = z.infer<typeof enrollmentSchema>;

interface EnrollmentFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function EnrollmentForm({ onClose, onSuccess }: EnrollmentFormProps) {
  const [students, setStudents] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EnrollmentFormData>({
    resolver: zodResolver(enrollmentSchema),
    defaultValues: {
      studentId: '',
      courseId: '',
      enrolledAt: new Date().toISOString().split('T')[0],
      attendanceMode: 'local',
      classType: 'hybrid',
      currency: 'PKR',
      feeType: 'custom',
      prorateFirstMonth: false,
      customFeePerMonth: '',
      perSessionFee: '',
      expectedClassesPerMonth: '',
      feeNotes: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
    },
  });

  const feeType = watch('feeType');
  const attendanceMode = watch('attendanceMode');
  const currency = watch('currency');
  const classType = watch('classType');
  const isOneToOne = classType === '1-to-1';

  // Auto-derive attendanceMode from classType for non-1-to-1 enrollments.
  // hybrid → local (teacher earns a percentage), online → online (fixed amount).
  useEffect(() => {
    if (classType === 'online') setValue('attendanceMode', 'online');
    else if (classType === 'hybrid') setValue('attendanceMode', 'local');
  }, [classType, setValue]);

  // Currency symbols mapping
  const currencySymbols: Record<CurrencyCode, string> = {
    PKR: 'Rs',
    USD: '$',
    GBP: '£',
    SAR: 'SR',
  };

  const currentSymbol = currencySymbols[currency || 'PKR'];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [studentsData, coursesData] = await Promise.all([
        usersApi.getUsers({ role: 'student', limit: 10000 }), // Fetch all students
        coursesApi.getCourses(true), // Only active courses
      ]);
      setStudents(studentsData);
      setCourses(coursesData);
    } catch (error: any) {
      toast.error('Failed to load students and courses');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: EnrollmentFormData) => {
    try {
      const input: CreateEnrollmentInput = {
        studentId: data.studentId,
        courseId: data.courseId,
        enrolledAt: data.enrolledAt || undefined,
        attendanceMode: data.attendanceMode,
        classType: data.classType || undefined,
        feeType: data.feeType,
        // For 1-to-1, send perSessionFee; otherwise send customFeePerMonth
        customFeePerMonth: data.classType === '1-to-1' ? undefined : data.customFeePerMonth,
        perSessionFee: data.classType === '1-to-1' ? data.perSessionFee : undefined,
        expectedClassesPerMonth: data.classType === '1-to-1' && data.expectedClassesPerMonth
          ? parseInt(data.expectedClassesPerMonth)
          : undefined,
        // Non-online students always bill in PKR — the currency select is hidden
        // for them, so a stale USD/GBP/SAR value must not leak into the payload
        currency: data.attendanceMode === 'online' ? data.currency : 'PKR',
        prorateFirstMonth: data.classType === '1-to-1' ? undefined : data.prorateFirstMonth,
        feeNotes: data.feeNotes || undefined,
        startDate: data.startDate || undefined,
        endDate: data.endDate || undefined,
      };
      await enrollmentsApi.createEnrollment(input);
      toast.success('Student enrolled successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to enroll student');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">Enroll Student</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        {loading ? (
          <LoadingSpinner message="Loading..." className="p-6" />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1 p-6">
              <div className="space-y-6">
              {/* Student Selection */}
              <Controller
                name="studentId"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    options={students.map((student) => ({
                      value: student.id,
                      label: `${student.firstName} ${student.lastName}`,
                      sublabel: student.email,
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    label="Select Student"
                    placeholder="Search and select a student"
                    required
                    error={errors.studentId?.message}
                  />
                )}
              />

              {/* Course Selection */}
              <Controller
                name="courseId"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    options={courses.map((course) => ({
                      value: course.id,
                      label: course.title,
                      sublabel: course.subject,
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    label="Select Course"
                    placeholder="Search and select a course"
                    required
                    error={errors.courseId?.message}
                  />
                )}
              />

              {/* Enrollment Date */}
              <div>
                <label htmlFor="enrolledAt" className="block text-sm font-medium text-gray-700 mb-1">
                  Enrollment Date
                </label>
                <input
                  type="date"
                  {...register('enrolledAt')}
                  id="enrolledAt"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="mt-1 text-sm text-gray-500">
                  The day of enrollment determines the billing cycle (e.g. 5th of each month)
                </p>
              </div>

              {/* Attendance Mode — determines teacher payment rate (local % vs online fixed) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Attendance Mode
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      {...register('attendanceMode')}
                      value="local"
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Local (In-person)</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      {...register('attendanceMode')}
                      value="online"
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Online (Teams)</span>
                  </label>
                </div>
              </div>

              {/* Currency - Only for Online Students */}
              {attendanceMode === 'online' && (
                <div>
                  <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
                    Currency
                  </label>
                  <select
                    {...register('currency')}
                    id="currency"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="PKR">PKR - Pakistani Rupee (Rs)</option>
                    <option value="USD">USD - US Dollar ($)</option>
                    <option value="GBP">GBP - British Pound (£)</option>
                    <option value="SAR">SAR - Saudi Riyal (SR)</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Select the currency for this online student's fees
                  </p>
                </div>
              )}

              {/* Class Type */}
              <div>
                <label htmlFor="classType" className="block text-sm font-medium text-gray-700 mb-1">
                  Class Type
                </label>
                <select
                  {...register('classType')}
                  id="classType"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="hybrid">Hybrid (In-person)</option>
                  <option value="online">Online</option>
                  <option value="1-to-1">1-to-1 (Per Session)</option>
                </select>
                {errors.classType && (
                  <p className="mt-1 text-sm text-red-600">{errors.classType.message}</p>
                )}
                {isOneToOne && (
                  <p className="mt-1 text-sm text-amber-600">
                    1-to-1 classes are billed based on sessions attended, not a fixed monthly fee.
                  </p>
                )}
              </div>

              {/* Pro-rate First Month — not applicable to 1-to-1 (usage-based) */}
              {!isOneToOne && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('prorateFirstMonth')}
                    className="mt-0.5 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-700">
                      Pro-rate first month
                    </span>
                    <span className="block text-xs text-gray-500">
                      First month is charged from the enrollment date to the end of that month, then full
                      months from the 1st. Overrides the 20th-of-month rule for the first month.
                    </span>
                  </span>
                </label>
              )}

              {/* Start Date */}
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  {...register('startDate')}
                  id="startDate"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {errors.startDate && (
                  <p className="mt-1 text-sm text-red-600">{errors.startDate.message}</p>
                )}
              </div>

              {/* End Date */}
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date (Optional)
                </label>
                <input
                  type="date"
                  {...register('endDate')}
                  id="endDate"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {errors.endDate && (
                  <p className="mt-1 text-sm text-red-600">{errors.endDate.message}</p>
                )}
              </div>

              {/* Fee Type */}
              <div>
                <label htmlFor="feeType" className="block text-sm font-medium text-gray-700 mb-1">
                  Fee Type
                </label>
                <select
                  {...register('feeType')}
                  id="feeType"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="custom">Custom Fee</option>
                  <option value="scholarship">Scholarship</option>
                </select>
                {errors.feeType && (
                  <p className="mt-1 text-sm text-red-600">{errors.feeType.message}</p>
                )}
              </div>

              {/* Fee Amount - conditional based on class type */}
              {isOneToOne ? (
                <>
                  <div>
                    <label htmlFor="perSessionFee" className="block text-sm font-medium text-gray-700 mb-1">
                      Fee Per Session *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500">{currentSymbol}</span>
                      <input
                        type="text"
                        {...register('perSessionFee')}
                        id="perSessionFee"
                        placeholder="0.00"
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      Student will be billed based on number of sessions attended each month.
                    </p>
                    {errors.customFeePerMonth && (
                      <p className="mt-1 text-sm text-red-600">{errors.customFeePerMonth.message}</p>
                    )}
                  </div>

                  {/* Expected classes per month */}
                  <div>
                    <label htmlFor="expectedClassesPerMonth" className="block text-sm font-medium text-gray-700 mb-1">
                      Expected Classes Per Month (Optional)
                    </label>
                    <input
                      type="number"
                      {...register('expectedClassesPerMonth')}
                      id="expectedClassesPerMonth"
                      min={1}
                      max={31}
                      placeholder="e.g. 8"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      Used to show the student a projected monthly fee on their dashboard.
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="customFeePerMonth" className="block text-sm font-medium text-gray-700 mb-1">
                    {feeType === 'scholarship' ? 'Scholarship Amount Per Month *' : 'Fee Per Month *'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500">{currentSymbol}</span>
                    <input
                      type="text"
                      {...register('customFeePerMonth')}
                      id="customFeePerMonth"
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  {errors.customFeePerMonth && (
                    <p className="mt-1 text-sm text-red-600">{errors.customFeePerMonth.message}</p>
                  )}
                </div>
              )}

              {/* Fee Notes - optional */}
              <div>
                <label htmlFor="feeNotes" className="block text-sm font-medium text-gray-700 mb-1">
                  Fee Notes (Optional)
                </label>
                <textarea
                  {...register('feeNotes')}
                  id="feeNotes"
                  rows={3}
                  placeholder="Reason for fee amount (e.g., 50% scholarship for academic excellence)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
                {errors.feeNotes && (
                  <p className="mt-1 text-sm text-red-600">{errors.feeNotes.message}</p>
                )}
              </div>

              {/* Info Note */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> {isOneToOne
                    ? 'For 1-to-1 classes, fees will be generated based on sessions attended. No initial fee is created upon enrollment.'
                    : 'Enrolling a student will automatically generate a fee for the current month.'}
                </p>
              </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 flex-shrink-0 bg-white">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Enrolling...' : 'Enroll Student'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
