import { useState, useEffect } from 'react';
import { analyticsApi, CourseAnalytics, AnalyticsQueryParams } from '../../api/analytics.api';
import BarChart from './charts/BarChart';
import LineChart from './charts/LineChart';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface CourseDashboardProps {
  filters: AnalyticsQueryParams;
}

export default function CourseDashboard({ filters }: CourseDashboardProps) {
  const [data, setData] = useState<CourseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const analytics = await analyticsApi.getCourseAnalytics(filters);
      setData(analytics);
    } catch (error) {
      console.error('Failed to fetch course analytics:', error);
      toast.error('Failed to load course analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading course analytics...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No course data available</p>
      </div>
    );
  }

  // Calculate metrics
  const totalCourses = data.coursePopularity.length;
  const totalEnrollments = data.coursePopularity.reduce((sum, c) => sum + c.totalEnrollments, 0);
  const totalActive = data.coursePopularity.reduce((sum, c) => sum + c.activeEnrollments, 0);
  const avgEnrollmentPerCourse = totalCourses > 0 ? totalEnrollments / totalCourses : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Total Courses</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{totalCourses}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Total Enrollments</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{totalEnrollments}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Active Enrollments</p>
          <p className="mt-2 text-3xl font-bold text-green-600">{totalActive}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Avg per Course</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {avgEnrollmentPerCourse.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Course Popularity */}
      <div className="bg-white rounded-lg shadow p-6">
        <BarChart
          data={data.coursePopularity}
          xKey="courseTitle"
          yKeys={['activeEnrollments', 'completedEnrollments']}
          colors={['#10b981', '#3b82f6']}
          height={350}
          title="Course Enrollment Status"
          yLabel="Number of Students"
        />
      </div>

      {/* Enrollment Trends */}
      {data.enrollmentTrends.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <LineChart
            data={data.enrollmentTrends}
            xKey="month"
            yKeys={['enrollmentCount']}
            colors={['#8b5cf6']}
            height={350}
            title="Enrollment Trends Over Time"
            yLabel="New Enrollments"
          />
        </div>
      )}

      {/* Course Details Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Course Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Active</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Completed</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Completion Rate</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.coursePopularity
                .sort((a, b) => b.totalEnrollments - a.totalEnrollments)
                .map((course) => {
                  const completionRate = course.totalEnrollments > 0
                    ? (course.completedEnrollments / course.totalEnrollments * 100)
                    : 0;
                  return (
                    <tr key={course.courseId}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {course.courseTitle}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right">
                        {course.activeEnrollments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 text-right">
                        {course.completedEnrollments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {course.totalEnrollments}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          completionRate >= 50 ? 'bg-green-100 text-green-800' :
                          completionRate >= 25 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {completionRate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
