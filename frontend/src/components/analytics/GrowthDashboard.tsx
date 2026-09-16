import { useState, useEffect } from 'react';
import { analyticsApi, GrowthAnalytics, AnalyticsQueryParams } from '../../api/analytics.api';
import BarChart from './charts/BarChart';
import LineChart from './charts/LineChart';
import DeltaBadge from './DeltaBadge';
import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { exportCsv, stampedFilename } from '../../utils/csv';
import toast from 'react-hot-toast';

interface GrowthDashboardProps {
  filters: AnalyticsQueryParams;
}

export default function GrowthDashboard({ filters }: GrowthDashboardProps) {
  const [data, setData] = useState<GrowthAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const analytics = await analyticsApi.getGrowthAnalytics(filters);
      setData(analytics);
    } catch (error) {
      console.error('Failed to fetch growth analytics:', error);
      toast.error('Failed to load growth analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading growth analytics...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No growth data available</p>
      </div>
    );
  }

  const { leadConversion, retention, comparison } = data;

  const handleExport = () => {
    if (leadConversion.bySource.length === 0) {
      toast.error('Nothing to export for this period');
      return;
    }
    exportCsv(
      stampedFilename('lead-conversion-by-source'),
      leadConversion.bySource,
      [
        { header: 'Source', value: s => s.source },
        { header: 'Enquiries', value: s => s.total },
        { header: 'Enrolled', value: s => s.converted },
        { header: 'Conversion %', value: s => s.conversionRate.toFixed(1) },
      ]
    );
    toast.success('Exported to CSV');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Compared with {comparison.previousPeriod.start} to {comparison.previousPeriod.end}
        </p>
        <button
          onClick={handleExport}
          className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <ArrowDownTrayIcon className="h-4 w-4 mr-2" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Enquiries</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{leadConversion.totalLeads}</p>
          <DeltaBadge changePercent={comparison.totalLeads.changePercent} />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Converted to students</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{leadConversion.totalConverted}</p>
          <p className="mt-1 text-xs text-gray-500">
            {leadConversion.conversionRate.toFixed(1)}% of enquiries
          </p>
          <DeltaBadge changePercent={comparison.conversionRate.changePercent} />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Active enrolments</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{retention.active}</p>
          <p className="mt-1 text-xs text-gray-500">{retention.total} in total, all time</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Drop-out rate</p>
          <p className={`mt-2 text-3xl font-bold ${retention.churnRate > 20 ? 'text-red-600' : 'text-gray-900'}`}>
            {retention.churnRate.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {retention.dropped} dropped of {retention.completed + retention.dropped} finished
          </p>
        </div>
      </div>

      {/* Enquiry trend */}
      <div className="bg-white rounded-lg shadow p-6">
        {leadConversion.trend.length > 0 ? (
          <LineChart
            data={leadConversion.trend}
            xKey="month"
            yKeys={['total', 'converted']}
            colors={['#3b82f6', '#10b981']}
            height={350}
            title="Enquiries and conversions over time"
            yLabel="Count"
          />
        ) : (
          <p className="py-12 text-center text-gray-500">No enquiries recorded in this period</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead status funnel */}
        <div className="bg-white rounded-lg shadow p-6">
          {leadConversion.byStatus.length > 0 ? (
            <BarChart
              data={leadConversion.byStatus}
              xKey="status"
              yKeys={['count']}
              colors={['#6366f1']}
              height={350}
              title="Enquiries by stage"
              yLabel="Count"
            />
          ) : (
            <p className="py-12 text-center text-gray-500">No enquiries in this period</p>
          )}
        </div>

        {/* Drop-offs by course */}
        <div className="bg-white rounded-lg shadow p-6">
          {retention.dropByCourse.length > 0 ? (
            <BarChart
              data={retention.dropByCourse}
              xKey="courseTitle"
              yKeys={['dropped']}
              colors={['#ef4444']}
              height={350}
              title="Drop-outs by course (all time)"
              yLabel="Students"
            />
          ) : (
            <p className="py-12 text-center text-gray-500">No drop-outs recorded</p>
          )}
        </div>
      </div>

      {/* Conversion by source */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Where enquiries come from</h3>
          <p className="mt-1 text-sm text-gray-500">
            Which sources bring enquiries, and which of those actually become students.
          </p>
        </div>
        {leadConversion.bySource.length === 0 ? (
          <p className="px-6 py-12 text-center text-gray-500">No enquiries in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Enquiries</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Enrolled</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Conversion</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leadConversion.bySource.map(source => (
                  <tr key={source.source}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {source.source.replace(/_/g, ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{source.total}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{source.converted}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        source.conversionRate >= 40 ? 'bg-green-100 text-green-800' :
                        source.conversionRate >= 15 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {source.conversionRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Retention summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900">Enrolment outcomes</h3>
        <p className="mt-1 text-sm text-gray-500">
          Drop-out and retention rates count only enrolments that have finished, since active
          ones have not had an outcome yet.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Active</p>
            <p className="mt-1 text-2xl font-semibold text-blue-600">{retention.active}</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Completed</p>
            <p className="mt-1 text-2xl font-semibold text-green-600">{retention.completed}</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Dropped</p>
            <p className="mt-1 text-2xl font-semibold text-red-600">{retention.dropped}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
