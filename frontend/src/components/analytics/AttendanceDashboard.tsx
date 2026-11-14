import { useState, useEffect } from 'react';
import { analyticsApi, AttendanceAnalytics, AnalyticsQueryParams } from '../../api/analytics.api';
import LineChart from './charts/LineChart';
import PieChart from './charts/PieChart';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import AnalyticsTable from './AnalyticsTable';

interface AttendanceDashboardProps {
  filters: AnalyticsQueryParams;
}

export default function AttendanceDashboard({ filters }: AttendanceDashboardProps) {
  const [data, setData] = useState<AttendanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const analytics = await analyticsApi.getAttendanceAnalytics(filters);
      setData(analytics);
    } catch (error) {
      console.error('Failed to fetch attendance analytics:', error);
      toast.error('Failed to load attendance analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading attendance analytics...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No attendance data available</p>
      </div>
    );
  }

  // Ensure all data arrays are valid
  const attendanceByStatusArray = Array.isArray(data.attendanceByStatus) ? data.attendanceByStatus : [];
  const attendanceTrendsArray = Array.isArray(data.attendanceTrends) ? data.attendanceTrends : [];

  // Calculate overall metrics
  const totalRecords = attendanceByStatusArray.reduce((sum, item) => sum + item.count, 0);
  const presentCount = attendanceByStatusArray.find(s => s.status === 'present')?.count || 0;
  const lateCount = attendanceByStatusArray.find(s => s.status === 'late')?.count || 0;
  const absentCount = attendanceByStatusArray.find(s => s.status === 'absent')?.count || 0;
  const overallAttendanceRate = totalRecords > 0 ? (presentCount / totalRecords * 100) : 0;
  const onTimeRate = totalRecords > 0 ? (presentCount / (presentCount + lateCount + absentCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Overall Attendance Rate</p>
          <p className="mt-2 text-3xl font-bold text-green-600">
            {overallAttendanceRate.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">On-Time Rate</p>
          <p className="mt-2 text-3xl font-bold text-blue-600">
            {onTimeRate.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Total Classes</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {attendanceTrendsArray.length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Absent Count</p>
          <p className="mt-2 text-3xl font-bold text-red-600">{absentCount}</p>
        </div>
      </div>

      {/* Attendance Trends */}
      {attendanceTrendsArray.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <LineChart
            data={attendanceTrendsArray}
            xKey="eventDate"
            yKeys={['attendanceRate']}
            colors={['#10b981']}
            height={350}
            title="Attendance Rate Over Time"
            yLabel="Attendance Rate (%)"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown Pie Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <PieChart
            data={attendanceByStatusArray}
            nameKey="status"
            valueKey="count"
            colors={['#10b981', '#f59e0b', '#ef4444']}
            height={350}
            title="Attendance Status Distribution"
          />
        </div>

        {/* Status Breakdown Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Attendance Breakdown</h3>
          </div>
          <div className="p-6 space-y-4">
            {attendanceByStatusArray.map((status) => (
              <div key={status.status} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium capitalize ${
                    status.status === 'present' ? 'text-green-600' :
                    status.status === 'late' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {status.status}
                  </span>
                  <span className="text-sm text-gray-900">
                    {status.count} ({status.percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      status.status === 'present' ? 'bg-green-600' :
                      status.status === 'late' ? 'bg-yellow-600' :
                      'bg-red-600'
                    }`}
                    style={{ width: `${status.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Class-by-class attendance: sort by any heading, filter by rate */}
      {attendanceTrendsArray.length > 0 && (
        <AnalyticsTable
          title="Class-by-Class Attendance"
          rows={attendanceTrendsArray}
          rowKey={(trend, index) => `${trend.eventDate}-${index}`}
          searchPlaceholder="Search a date, e.g. 2026-11..."
          defaultSort={{ key: 'date', direction: 'desc' }}
          filters={[{ label: 'All rates', options: [
            { label: '90% and above', test: (trend) => trend.attendanceRate >= 90 },
            { label: '75% to 90%', test: (trend) => trend.attendanceRate >= 75 && trend.attendanceRate < 90 },
            { label: 'Below 75%', test: (trend) => trend.attendanceRate < 75 },
          ] }]}
          columns={[
            {
              // Sorts and searches on the stored YYYY-MM-DD text; shown as "Nov 14, 2026"
              key: 'date', header: 'Date', value: (trend) => String(trend.eventDate).slice(0, 10),
              cell: (trend) => new Date(trend.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              className: 'text-gray-900 whitespace-nowrap',
            },
            { key: 'total', header: 'Total', align: 'right', value: (trend) => trend.totalStudents },
            { key: 'present', header: 'Present', align: 'right', value: (trend) => trend.presentCount, className: 'text-green-600' },
            { key: 'late', header: 'Late', align: 'right', value: (trend) => trend.lateCount, className: 'text-yellow-600' },
            { key: 'absent', header: 'Absent', align: 'right', value: (trend) => trend.absentCount, className: 'text-red-600' },
            {
              key: 'rate', header: 'Rate', align: 'right', value: (trend) => trend.attendanceRate,
              cell: (trend) => (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  trend.attendanceRate >= 90 ? 'bg-green-100 text-green-800' :
                  trend.attendanceRate >= 75 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {trend.attendanceRate.toFixed(1)}%
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
