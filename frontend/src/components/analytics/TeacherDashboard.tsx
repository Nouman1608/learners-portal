import { useState, useEffect } from 'react';
import { analyticsApi, TeacherAnalytics, AnalyticsQueryParams } from '../../api/analytics.api';
import BarChart from './charts/BarChart';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface TeacherDashboardProps {
  filters: AnalyticsQueryParams;
}

export default function TeacherDashboard({ filters }: TeacherDashboardProps) {
  const [data, setData] = useState<TeacherAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const analytics = await analyticsApi.getTeacherAnalytics(filters);
      setData(analytics);
    } catch (error) {
      console.error('Failed to fetch teacher analytics:', error);
      toast.error('Failed to load teacher analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading teacher analytics...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No teacher data available</p>
      </div>
    );
  }

  // Calculate metrics
  const totalTeachers = data.teacherWorkload.length;
  const totalCourses = data.teacherWorkload.reduce((sum, t) => sum + t.courseCount, 0);
  const totalClasses = data.teacherWorkload.reduce((sum, t) => sum + t.totalClasses, 0);
  const totalStudents = data.teacherWorkload.reduce((sum, t) => sum + t.studentCount, 0);
  const avgCoursesPerTeacher = totalTeachers > 0 ? totalCourses / totalTeachers : 0;
  const avgStudentsPerTeacher = totalTeachers > 0 ? totalStudents / totalTeachers : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Total Teachers</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{totalTeachers}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Total Classes</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{totalClasses}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Avg Courses/Teacher</p>
          <p className="mt-2 text-3xl font-bold text-blue-600">
            {avgCoursesPerTeacher.toFixed(1)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Avg Students/Teacher</p>
          <p className="mt-2 text-3xl font-bold text-green-600">
            {avgStudentsPerTeacher.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Teacher Workload Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <BarChart
            data={data.teacherWorkload.map(t => ({
              name: t.teacherName,
              courses: t.courseCount,
            }))}
            xKey="name"
            yKeys={['courses']}
            colors={['#3b82f6']}
            height={350}
            title="Courses per Teacher"
            yLabel="Number of Courses"
          />
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <BarChart
            data={data.teacherWorkload.map(t => ({
              name: t.teacherName,
              students: t.studentCount,
            }))}
            xKey="name"
            yKeys={['students']}
            colors={['#10b981']}
            height={350}
            title="Students per Teacher"
            yLabel="Number of Students"
          />
        </div>
      </div>

      {/* Teacher Details Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Teacher Workload Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teacher</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Courses</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Classes</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Students</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Workload</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.teacherWorkload
                .sort((a, b) => b.studentCount - a.studentCount)
                .map((teacher) => {
                  // Calculate workload score (weighted: classes + students)
                  const workloadScore = teacher.totalClasses + (teacher.studentCount / 10);
                  return (
                    <tr key={teacher.teacherId}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {teacher.teacherName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {teacher.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {teacher.courseCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {teacher.totalClasses}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {teacher.studentCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          workloadScore >= 50 ? 'bg-red-100 text-red-800' :
                          workloadScore >= 30 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {workloadScore >= 50 ? 'High' : workloadScore >= 30 ? 'Medium' : 'Low'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workload Distribution */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Workload Distribution</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.teacherWorkload.map(teacher => {
            const workloadScore = teacher.totalClasses + (teacher.studentCount / 10);
            return (
              <div key={teacher.teacherId} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">
                    {teacher.teacherName}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    workloadScore >= 50 ? 'bg-red-100 text-red-800' :
                    workloadScore >= 30 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {workloadScore.toFixed(1)}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Courses:</span>
                    <span className="font-medium">{teacher.courseCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Classes:</span>
                    <span className="font-medium">{teacher.totalClasses}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Students:</span>
                    <span className="font-medium">{teacher.studentCount}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
