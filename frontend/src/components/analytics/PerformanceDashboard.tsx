import { useState, useEffect } from 'react';
import { analyticsApi, PerformanceAnalytics, AnalyticsQueryParams } from '../../api/analytics.api';
import BarChart from './charts/BarChart';
import LineChart from './charts/LineChart';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

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
  const passFailRatesArray = Array.isArray(data.passFailRates) ? data.passFailRates : [];
  const coursePerformanceArray = Array.isArray(data.coursePerformanceComparison) ? data.coursePerformanceComparison : [];
  const topPerformersArray = Array.isArray(data.topPerformers) ? data.topPerformers : [];

  const totalPassFailRates = passFailRatesArray.reduce(
    (acc, rate) => ({
      total: acc.total + rate.totalCount,
      passed: acc.passed + rate.passedCount,
      failed: acc.failed + rate.failedCount,
    }),
    { total: 0, passed: 0, failed: 0 }
  );
  const overallPassRate = totalPassFailRates.total > 0
    ? (totalPassFailRates.passed / totalPassFailRates.total * 100)
    : 0;

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
            {totalPassFailRates.total}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Failed</p>
          <p className="mt-2 text-3xl font-bold text-red-600">
            {totalPassFailRates.failed}
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
            title="Average Score by Course"
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

      {/* Top Performers */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Top Performers</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Assessments</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Score</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {topPerformersArray.map((student, index) => (
                <tr key={student.studentId}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
                      index === 0 ? 'bg-yellow-100 text-yellow-800' :
                      index === 1 ? 'bg-gray-100 text-gray-800' :
                      index === 2 ? 'bg-orange-100 text-orange-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {student.firstName} {student.lastName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {student.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {student.assessmentCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {(student.avgScore ?? 0).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pass/Fail Rates by Course */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Pass/Fail Rates by Course</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Passed</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Failed</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pass Rate</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {passFailRatesArray.map((rate) => (
                <tr key={rate.courseId || 'overall'}>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {rate.courseTitle || 'Overall'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {rate.totalCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right">
                    {rate.passedCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right">
                    {rate.failedCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      rate.passRate >= 80 ? 'bg-green-100 text-green-800' :
                      rate.passRate >= 60 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {(rate.passRate ?? 0).toFixed(1)}%
                    </span>
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
