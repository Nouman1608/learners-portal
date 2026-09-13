import { StudentOverview } from '../../api/student-portal.api';
import {
  AcademicCapIcon,
  CalendarIcon,
  BanknotesIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';

interface ParentDashboardProps {
  overview: StudentOverview;
}

export default function ParentDashboard({ overview }: ParentDashboardProps) {
  const { student, courses, academic, attendance, fees } = overview;

  return (
    <div className="space-y-6">
      {/* Student Info Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-lg p-6 text-white">
        <h2 className="text-2xl font-bold">
          {student.firstName} {student.lastName}
        </h2>
        <p className="text-blue-100 mt-1">{student.email}</p>
        <div className="mt-4 flex items-center space-x-6">
          <div>
            <p className="text-sm text-blue-200">Enrolled Courses</p>
            <p className="text-2xl font-bold">{courses.length}</p>
          </div>
          <div>
            <p className="text-sm text-blue-200">Active Enrollments</p>
            <p className="text-2xl font-bold">
              {courses.filter((c) => c.status === 'active').length}
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Academic Performance */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100">
              <AcademicCapIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Average Score</p>
              <p className="text-2xl font-bold text-gray-900">
                {academic.averageScore.toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-between text-sm">
            <span className="text-green-600">
              Passed: {academic.passedCount}
            </span>
            <span className="text-red-600">Failed: {academic.failedCount}</span>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full"
              style={{ width: `${academic.passRate}%` }}
            />
          </div>
        </div>

        {/* Attendance */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100">
              <CalendarIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">
                Attendance Rate
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {attendance.attendanceRate.toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Present:</span>
              <span className="text-green-600">{attendance.presentCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Late:</span>
              <span className="text-yellow-600">{attendance.lateCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Absent:</span>
              <span className="text-red-600">{attendance.absentCount}</span>
            </div>
          </div>
        </div>

        {/* Fees */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-purple-100">
              <BanknotesIcon className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Outstanding</p>
              <p className="text-2xl font-bold text-gray-900">
                PKR {fees.totalOutstanding.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Fees:</span>
              <span className="font-medium">
                PKR {fees.totalFees.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Paid:</span>
              <span className="text-green-600">
                PKR {fees.totalPaid.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Total Assessments */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-orange-100">
              <BookOpenIcon className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Assessments</p>
              <p className="text-2xl font-bold text-gray-900">
                {academic.totalAssessments}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm text-gray-600">
              Pass Rate:{' '}
              <span
                className={`font-medium ${
                  academic.passRate >= 80
                    ? 'text-green-600'
                    : academic.passRate >= 60
                    ? 'text-yellow-600'
                    : 'text-red-600'
                }`}
              >
                {academic.passRate.toFixed(1)}%
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Enrolled Courses */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Enrolled Courses
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Course
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Enrolled Since
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {courses.map((course) => (
                <tr key={course.courseId}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {course.courseTitle}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        course.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : course.status === 'completed'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {course.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(course.enrolledAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
