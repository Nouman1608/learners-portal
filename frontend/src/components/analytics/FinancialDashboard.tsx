import { useState, useEffect } from 'react';
import { analyticsApi, FinancialAnalytics, AnalyticsQueryParams } from '../../api/analytics.api';
import LineChart from './charts/LineChart';
import BarChart from './charts/BarChart';
import PieChart from './charts/PieChart';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface FinancialDashboardProps {
  filters: AnalyticsQueryParams;
}

export default function FinancialDashboard({ filters }: FinancialDashboardProps) {
  const [data, setData] = useState<FinancialAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const analytics = await analyticsApi.getFinancialAnalytics(filters);
      setData(analytics);
    } catch (error) {
      console.error('Failed to fetch financial analytics:', error);
      toast.error('Failed to load financial analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading financial analytics...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No financial data available</p>
      </div>
    );
  }

  // Calculate totals
  const totalRevenue = data.revenueOverTime.reduce((sum, item) => sum + item.revenue, 0);
  const totalTransactions = data.revenueOverTime.reduce((sum, item) => sum + item.transactionCount, 0);
  const totalOutstanding = data.outstandingFees.reduce((sum, item) => sum + item.amount, 0);
  const avgTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Total Revenue</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            PKR {totalRevenue.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Transactions</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{totalTransactions}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Avg Transaction</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            PKR {avgTransactionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Outstanding Fees</p>
          <p className="mt-2 text-3xl font-bold text-red-600">
            PKR {totalOutstanding.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Revenue Over Time */}
      <div className="bg-white rounded-lg shadow p-6">
        <LineChart
          data={data.revenueOverTime}
          xKey="date"
          yKeys={['revenue']}
          colors={['#3b82f6']}
          height={350}
          title="Revenue Over Time"
          yLabel="Revenue (PKR)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <div className="bg-white rounded-lg shadow p-6">
          <PieChart
            data={data.paymentMethods}
            nameKey="method"
            valueKey="amount"
            height={350}
            title="Payment Methods Distribution"
          />
        </div>

        {/* Outstanding Fees Aging */}
        <div className="bg-white rounded-lg shadow p-6">
          <BarChart
            data={data.outstandingFees}
            xKey="range"
            yKeys={['amount']}
            colors={['#ef4444']}
            height={350}
            title="Outstanding Fees Aging"
            yLabel="Amount (PKR)"
          />
        </div>
      </div>

      {/* Course Revenue */}
      <div className="bg-white rounded-lg shadow p-6">
        <BarChart
          data={data.courseRevenue}
          xKey="courseTitle"
          yKeys={['revenue']}
          colors={['#10b981']}
          height={350}
          title="Revenue by Course"
          yLabel="Revenue (PKR)"
        />
      </div>

      {/* Detailed Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Payment Methods</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Count</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.paymentMethods.map((method) => (
                  <tr key={method.method}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {method.method.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {method.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      PKR {method.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Course Revenue Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Top Revenue Courses</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Students</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.courseRevenue.slice(0, 5).map((course) => (
                  <tr key={course.courseId}>
                    <td className="px-6 py-4 text-sm text-gray-900">{course.courseTitle}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {course.studentCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      PKR {course.revenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
