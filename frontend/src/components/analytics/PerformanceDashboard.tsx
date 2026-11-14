import { useState, useEffect } from 'react';
import { analyticsApi, PerformanceAnalytics, AnalyticsQueryParams } from '../../api/analytics.api';
import BarChart from './charts/BarChart';
import LineChart from './charts/LineChart';
import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { exportCsv, stampedFilename } from '../../utils/csv';
import toast from 'react-hot-toast';
import { terms } from '../../brand';
import AnalyticsTable from './AnalyticsTable';

interface PerformanceDashboardProps {
  filters: AnalyticsQueryParams;
}

export default function PerformanceDashboard({ filters }: PerformanceDashboardProps) {
  const [data, setData] = useState<PerformanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const analytics = await analyticsApi.getPerformanceAnalytics(filters);
      setData(analytics);
    } catch (error) {
      console.error('Failed to fetch performance analytics:', error);
      toast.error('Failed to load performance analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading performance analytics...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No performance data available</p>
      </div>
    );
  }

  // Calculate metrics
  // Ensure all data arrays are valid before using them
  const coursePerformanceArray = Array.isArray(data.coursePerformanceComparison) ? data.coursePerformanceComparison : [];
  const topPerformersArray = Array.isArray(data.topPerformers) ? data.topPerformers : [];
  const atRiskStudents = Array.isArray(data.atRiskStudents) ? data.atRiskStudents : [];

  // The API returns one set of figures for the current filter, not one row per course.
  const passFail = data.passFailRates ?? {
    totalAssessments: 0,
    passedCount: 0,
    failedCount: 0,
    passRate: 0,
  };
  const overallPassRate = passFail.passRate ?? 0;

  const avgCourseScore = coursePerformanceArray.length > 0
    ? coursePerformanceArray.reduce((sum, c) => sum + (c.avgScore || 0), 0) / coursePerformanceArray.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Overall Pass Rate</p>
          <p className="mt-2 text-3xl font-bold text-green-600">
            {overallPassRate.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Average Score</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {avgCourseScore.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Total Assessments</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {passFail.totalAssessments}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Failed</p>
          <p className="mt-2 text-3xl font-bold text-red-600">
            {passFail.failedCount}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <BarChart
            data={data.assessmentDistributions}
            xKey="scoreRange"
            yKeys={['count']}
            colors={['#3b82f6']}
            height={350}
            title="Score Distribution by Grade"
            yLabel="Number of Students"
          />
        </div>

        {/* Course Performance Comparison */}
        <div className="bg-white rounded-lg shadow p-6">
          <BarChart
            data={data.coursePerformanceComparison}
            xKey="courseTitle"
            yKeys={['avgScore']}
            colors={['#10b981']}
            height={350}
            title={`Average Score by ${terms.course}`}
            yLabel="Average Score (%)"
          />
        </div>
      </div>

      {/* Student Performance Trends */}
      {data.studentPerformanceTrends && data.studentPerformanceTrends.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <LineChart
            data={data.studentPerformanceTrends}
            xKey="assessmentTitle"
            yKeys={['scorePercentage']}
            colors={['#8b5cf6']}
            height={350}
            title="Student Performance Trends"
            yLabel="Score (%)"
          />
        </div>
      )}

      {/* Top performers: sort by any heading, search a student */}
      <AnalyticsTable
        title="Top Performers"
        rows={topPerformersArray.map((student, index) => ({ ...student, rank: index + 1 }))}
        rowKey={(student) => student.studentId}
        searchPlaceholder="Search student or email..."
        emptyText="No graded assessments yet"
        defaultSort={{ key: 'rank', direction: 'asc' }}
        columns={[
          {
            key: 'rank', header: 'Rank', value: (student) => student.rank,
            cell: (student) => (
              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
                student.rank === 1 ? 'bg-yellow-100 text-yellow-800' :
                student.rank === 2 ? 'bg-gray-100 text-gray-800' :
                student.rank === 3 ? 'bg-orange-100 text-orange-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {student.rank}
              </span>
            ),
          },
          { key: 'student', header: 'Student', value: (student) => `${student.firstName} ${student.lastName}`, className: 'font-medium text-gray-900 whitespace-nowrap' },
          { key: 'email', header: 'Email', value: (student) => student.email, className: 'text-gray-500 whitespace-nowrap' },
          { key: 'assessments', header: 'Assessments', align: 'right', value: (student) => student.assessmentCount },
          {
            key: 'score', header: 'Avg Score', align: 'right', value: (student) => student.avgScore ?? 0,
            cell: (student) => (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {(student.avgScore ?? 0).toFixed(1)}%
              </span>
            ),
          },
        ]}
      />

      {/* Pass/Fail summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900">Pass and fail totals</h3>
        <p className="mt-1 text-sm text-gray-500">
          Across every graded assessment matching the current filters. A score of 60% or above passes.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Graded</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{passFail.totalAssessments}</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Passed</p>
            <p className="mt-1 text-2xl font-semibold text-green-600">{passFail.passedCount}</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Failed</p>
            <p className="mt-1 text-2xl font-semibold text-red-600">{passFail.failedCount}</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Pass rate</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{overallPassRate.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Students needing attention: sort by any heading, search, filter by concern */}
      <AnalyticsTable
        title="Students needing attention"
        description="Flagged for weak attendance, low scores, or unpaid fees. Highest concern first."
        rows={atRiskStudents}
        rowKey={(student) => student.studentId}
        searchPlaceholder="Search student, email or concern..."
        emptyText="No students are currently flagged. Nothing to action."
        defaultSort={{ key: 'concern', direction: 'desc' }}
        filters={[{ label: 'All concerns', options: [
          { label: 'High concern', test: (student) => student.riskScore >= 50 },
          { label: 'Has overdue fees', test: (student) => student.overdueCount > 0 },
          { label: 'Attendance recorded', test: (student) => student.attendanceRate !== null },
          { label: 'Scores recorded', test: (student) => student.avgScore !== null },
        ] }]}
        actions={atRiskStudents.length > 0 && (
          <button
            onClick={() => {
              exportCsv(
                stampedFilename('students-needing-attention'),
                atRiskStudents,
                [
                  { header: 'Student', value: s => s.studentName },
                  { header: 'Email', value: s => s.email },
                  { header: 'Attendance %', value: s => s.attendanceRate?.toFixed(1) ?? '' },
                  { header: 'Average score %', value: s => s.avgScore?.toFixed(1) ?? '' },
                  { header: 'Overdue fees', value: s => s.overdueCount },
                  { header: 'Overdue amount (PKR)', value: s => Math.round(s.overduePKR) },
                  { header: 'Concerns', value: s => s.reasons.join('; ') },
                ]
              );
              toast.success('Exported to CSV');
            }}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <ArrowDownTrayIcon className="h-4 w-4 mr-2" aria-hidden="true" />
            Export CSV
          </button>
        )}
        columns={[
          {
            // Name and email are both searched; the email is shown under the name
            key: 'student', header: 'Student', value: (student) => `${student.studentName} ${student.email}`,
            cell: (student) => (
              <>
                <p className="font-medium text-gray-900">{student.studentName}</p>
                <p className="text-gray-500">{student.email}</p>
              </>
            ),
          },
          {
            key: 'reasons', header: 'Concerns', value: (student) => student.reasons.join(', '),
            cell: (student) => (
              <div className="flex flex-wrap gap-1">
                {student.reasons.map((reason) => (
                  <span
                    key={reason}
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      student.riskScore >= 50
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {reason}
                  </span>
                ))}
              </div>
            ),
          },
          { key: 'concern', header: 'Concern', align: 'right', value: (student) => student.riskScore, className: 'text-gray-500' },
          {
            key: 'attendance', header: 'Attendance', align: 'right', value: (student) => student.attendanceRate,
            cell: (student) => (student.attendanceRate === null ? '—' : `${student.attendanceRate.toFixed(0)}%`),
          },
          {
            key: 'score', header: 'Avg score', align: 'right', value: (student) => student.avgScore,
            cell: (student) => (student.avgScore === null ? '—' : `${student.avgScore.toFixed(0)}%`),
          },
          {
            key: 'overdue', header: 'Overdue', align: 'right', value: (student) => (student.overdueCount === 0 ? null : student.overduePKR),
            cell: (student) => (student.overdueCount === 0 ? '—' : `PKR ${Math.round(student.overduePKR).toLocaleString()}`),
            className: 'text-red-600',
          },
        ]}
      />
    </div>
  );
}
