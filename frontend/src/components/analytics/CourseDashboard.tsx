import { useState, useEffect } from 'react';
import { analyticsApi, CourseAnalytics, AnalyticsQueryParams } from '../../api/analytics.api';
import BarChart from './charts/BarChart';
import LineChart from './charts/LineChart';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { terms } from '../../brand';
import AnalyticsTable from './AnalyticsTable';

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
      toast.error(`Failed to load ${terms.courseLc} analytics`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading {terms.courseLc} analytics...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No {terms.courseLc} data available</p>
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
          <p className="text-sm font-medium text-gray-600">Total {terms.courses}</p>
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
          <p className="text-sm font-medium text-gray-600">Avg per {terms.course}</p>
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
          title={`${terms.course} Enrollment Status`}
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

      {/* Course details: sort by any heading, search, filter */}
      <AnalyticsTable
        title={`${terms.course} Details`}
        rows={data.coursePopularity}
        rowKey={(course) => course.courseId}
        searchPlaceholder={`Search ${terms.courseLc}...`}
        emptyText={`No ${terms.coursesLc}`}
        defaultSort={{ key: 'total', direction: 'desc' }}
        filters={[{ label: 'All', options: [
          { label: 'With active students', test: (course) => course.activeEnrollments > 0 },
          { label: 'No active students', test: (course) => course.activeEnrollments === 0 },
        ] }]}
        columns={[
          { key: 'course', header: terms.course, value: (course) => course.courseTitle, className: 'font-medium text-gray-900' },
          { key: 'active', header: 'Active', align: 'right', value: (course) => course.activeEnrollments, className: 'text-green-600' },
          { key: 'completed', header: 'Completed', align: 'right', value: (course) => course.completedEnrollments, className: 'text-blue-600' },
          { key: 'total', header: 'Total', align: 'right', value: (course) => course.totalEnrollments },
          {
            key: 'rate', header: 'Completion Rate', align: 'right',
            value: (course) => (course.totalEnrollments > 0 ? (course.completedEnrollments / course.totalEnrollments) * 100 : 0),
            cell: (course) => {
              const completionRate = course.totalEnrollments > 0 ? (course.completedEnrollments / course.totalEnrollments) * 100 : 0;
              return (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  completionRate >= 50 ? 'bg-green-100 text-green-800' :
                  completionRate >= 25 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {completionRate.toFixed(1)}%
                </span>
              );
            },
          },
        ]}
      />
    </div>
  );
}
