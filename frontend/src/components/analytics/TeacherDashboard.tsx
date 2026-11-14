import { useState, useEffect } from 'react';
import { analyticsApi, TeacherAnalytics, AnalyticsQueryParams } from '../../api/analytics.api';
import BarChart from './charts/BarChart';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { terms } from '../../brand';
import AnalyticsTable from './AnalyticsTable';

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
          <p className="text-sm font-medium text-gray-600">Avg {terms.courses}/Teacher</p>
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
            title={`${terms.courses} per Teacher`}
            yLabel={`Number of ${terms.courses}`}
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

      {/* Teacher workload: sort by any heading, search, filter */}
      <AnalyticsTable
        title="Teacher Workload Details"
        rows={data.teacherWorkload}
        rowKey={(teacher, index) => `${teacher.teacherId}-${index}`}
        searchPlaceholder="Search teacher or email..."
        emptyText="No teachers"
        defaultSort={{ key: 'students', direction: 'desc' }}
        filters={[{ label: 'All workloads', options: [
          { label: 'High', test: (teacher) => teacher.totalClasses + teacher.studentCount / 10 >= 50 },
          { label: 'Medium', test: (teacher) => { const score = teacher.totalClasses + teacher.studentCount / 10; return score >= 30 && score < 50; } },
          { label: 'Low', test: (teacher) => teacher.totalClasses + teacher.studentCount / 10 < 30 },
        ] }]}
        columns={[
          { key: 'teacher', header: 'Teacher', value: (teacher) => teacher.teacherName, className: 'font-medium text-gray-900 whitespace-nowrap' },
          { key: 'email', header: 'Email', value: (teacher) => teacher.email, className: 'text-gray-500 whitespace-nowrap' },
          { key: 'courses', header: terms.courses, align: 'right', value: (teacher) => teacher.courseCount },
          { key: 'classes', header: 'Classes', align: 'right', value: (teacher) => teacher.totalClasses },
          { key: 'students', header: 'Students', align: 'right', value: (teacher) => teacher.studentCount },
          {
            // Workload score (weighted: classes + students)
            key: 'workload', header: 'Workload', align: 'right',
            value: (teacher) => teacher.totalClasses + teacher.studentCount / 10,
            cell: (teacher) => {
              const workloadScore = teacher.totalClasses + teacher.studentCount / 10;
              return (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  workloadScore >= 50 ? 'bg-red-100 text-red-800' :
                  workloadScore >= 30 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {workloadScore >= 50 ? 'High' : workloadScore >= 30 ? 'Medium' : 'Low'}
                </span>
              );
            },
          },
        ]}
      />

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
                    <span>{terms.courses}:</span>
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
