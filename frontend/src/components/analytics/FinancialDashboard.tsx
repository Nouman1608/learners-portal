import { useState, useEffect } from 'react';
import { analyticsApi, FinancialAnalytics, AnalyticsQueryParams, CurrencyRevenue, CurrencyAmount } from '../../api/analytics.api';
import { currencyApi } from '../../api/currency.api';
import { CurrencyCode } from '../../api/enrollments.api';
import LineChart from './charts/LineChart';
import BarChart from './charts/BarChart';
import PieChart from './charts/PieChart';
import DeltaBadge from './DeltaBadge';
import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { exportCsv, stampedFilename } from '../../utils/csv';
import toast from 'react-hot-toast';

interface FinancialDashboardProps {
  filters: AnalyticsQueryParams;
}

const pkr = (amount: number) =>
  `PKR ${Math.round(amount).toLocaleString()}`;

const money = (amount: number, currency: string) =>
  currencyApi.formatAmount(amount, currency as CurrencyCode);

/** Merges per-currency rows from several periods into one list per currency. */
function mergeCurrencies(
  groups: (CurrencyRevenue | CurrencyAmount)[][]
): { currency: string; amount: number; amountPKR: number }[] {
  const totals = new Map<string, { amount: number; amountPKR: number }>();
  for (const group of groups) {
    for (const row of group) {
      const amount = 'revenue' in row ? row.revenue : row.amount;
      const amountPKR = 'revenuePKR' in row ? row.revenuePKR : row.amountPKR;
      const running = totals.get(row.currency) ?? { amount: 0, amountPKR: 0 };
      running.amount += amount;
      running.amountPKR += amountPKR;
      totals.set(row.currency, running);
    }
  }
  return Array.from(totals.entries())
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => b.amountPKR - a.amountPKR);
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

  const { totals, comparison, collectionRate, courseProfitability } = data;
  const revenueByCurrency = mergeCurrencies(data.revenueOverTime.map(r => r.byCurrency));
  const outstandingByCurrency = mergeCurrencies(data.outstandingFees.map(r => r.byCurrency));
  const outstandingPKR = data.outstandingFees.reduce((sum, r) => sum + r.amountPKR, 0);
  const hasData = data.revenueOverTime.length > 0;

  const handleExport = () => {
    if (courseProfitability.length === 0) {
      toast.error('Nothing to export for this period');
      return;
    }
    exportCsv(
      stampedFilename('course-profitability'),
      courseProfitability,
      [
        { header: 'Course', value: c => c.courseTitle },
        { header: 'Students', value: c => c.studentCount },
        { header: 'Revenue (PKR)', value: c => Math.round(c.revenuePKR) },
        { header: 'Teacher cost (PKR)', value: c => Math.round(c.teacherCostPKR) },
        { header: 'Profit (PKR)', value: c => Math.round(c.profitPKR) },
        { header: 'Margin %', value: c => c.marginPercent.toFixed(1) },
        { header: 'Revenue per student (PKR)', value: c => Math.round(c.revenuePerStudentPKR) },
      ]
    );
    toast.success('Exported to CSV');
  };

  return (
    <div className="space-y-6">
      {/* Period being shown, so the figures are never ambiguous */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Showing <span className="font-medium text-gray-900">{comparison.period.start}</span> to{' '}
          <span className="font-medium text-gray-900">{comparison.period.end}</span>
          <span className="text-gray-400"> · compared with {comparison.previousPeriod.start} to {comparison.previousPeriod.end}</span>
        </p>
        <button
          onClick={handleExport}
          className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <ArrowDownTrayIcon className="h-4 w-4 mr-2" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Revenue collected</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{pkr(totals.revenuePKR)}</p>
          <DeltaBadge changePercent={comparison.revenuePKR.changePercent} />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Collection rate</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {collectionRate.collectionRate.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {collectionRate.paidCount} of {collectionRate.feeCount} fees paid
          </p>
          <DeltaBadge changePercent={comparison.collectionRate.changePercent} />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Profit after teacher cost</p>
          <p className={`mt-2 text-3xl font-bold ${totals.profitPKR >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {pkr(totals.profitPKR)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Teacher cost {pkr(totals.teacherCostPKR)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Outstanding fees</p>
          <p className="mt-2 text-3xl font-bold text-red-600">{pkr(outstandingPKR)}</p>
          <p className="mt-1 text-xs text-gray-500">Across all currencies</p>
        </div>
      </div>

      {/* Currency breakdown - the actual amounts, not just the PKR equivalent */}
      {revenueByCurrency.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900">Revenue by currency</h3>
          <p className="mt-1 text-sm text-gray-500">
            Amounts as actually billed. PKR equivalents use the configured exchange rates.
          </p>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {revenueByCurrency.map(row => (
              <div key={row.currency} className="border border-gray-200 rounded-lg p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{row.currency}</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">
                  {money(row.amount, row.currency)}
                </p>
                {row.currency !== 'PKR' && (
                  <p className="text-xs text-gray-500">≈ {pkr(row.amountPKR)}</p>
                )}
              </div>
            ))}
          </div>
          {outstandingByCurrency.length > 0 && (
            <>
              <h4 className="mt-6 text-sm font-semibold text-gray-900">Outstanding by currency</h4>
              <div className="mt-2 flex flex-wrap gap-3">
                {outstandingByCurrency.map(row => (
                  <span key={row.currency} className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-sm text-red-700">
                    {money(row.amount, row.currency)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Revenue Over Time */}
      <div className="bg-white rounded-lg shadow p-6">
        {hasData ? (
          <LineChart
            data={data.revenueOverTime}
            xKey="date"
            yKeys={['revenuePKR']}
            colors={['#3b82f6']}
            height={350}
            title="Revenue over time (PKR equivalent)"
            yLabel="Revenue (PKR)"
          />
        ) : (
          <p className="py-12 text-center text-gray-500">No revenue recorded in this period</p>
        )}
      </div>

      {/* Collection rate per currency */}
      {collectionRate.byCurrency.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Collection rate by currency</h3>
            <p className="mt-1 text-sm text-gray-500">Of fees due in this period, how much has been received.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Billed</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Collected</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Outstanding</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {collectionRate.byCurrency.map(row => (
                  <tr key={row.currency}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.currency}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{money(row.billed, row.currency)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 text-right">{money(row.collected, row.currency)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right">{money(row.outstanding, row.currency)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">{row.collectionRate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <div className="bg-white rounded-lg shadow p-6">
          {data.paymentMethods.length > 0 ? (
            <PieChart
              data={data.paymentMethods}
              nameKey="method"
              valueKey="amountPKR"
              height={350}
              title="Payment methods (PKR equivalent)"
            />
          ) : (
            <p className="py-12 text-center text-gray-500">No payments in this period</p>
          )}
        </div>

        {/* Outstanding Fees Aging */}
        <div className="bg-white rounded-lg shadow p-6">
          {data.outstandingFees.length > 0 ? (
            <BarChart
              data={data.outstandingFees}
              xKey="range"
              yKeys={['amountPKR']}
              colors={['#ef4444']}
              height={350}
              title="Outstanding fees by age (PKR equivalent)"
              yLabel="Amount (PKR)"
            />
          ) : (
            <p className="py-12 text-center text-gray-500">Nothing outstanding</p>
          )}
        </div>
      </div>

      {/* Course profitability */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Course profitability</h3>
          <p className="mt-1 text-sm text-gray-500">
            Revenue collected less teacher invoices for the same period, converted to PKR.
          </p>
        </div>
        {courseProfitability.length === 0 ? (
          <p className="px-6 py-12 text-center text-gray-500">No course revenue in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Students</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Teacher cost</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {courseProfitability.map(course => (
                  <tr key={course.courseId}>
                    <td className="px-6 py-4 text-sm text-gray-900">{course.courseTitle}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{course.studentCount}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{pkr(course.revenuePKR)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">{pkr(course.teacherCostPKR)}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${course.profitPKR >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {pkr(course.profitPKR)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${course.marginPercent >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      {course.marginPercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment methods table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Payment methods</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Count</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amounts</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">PKR equivalent</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.paymentMethods.map(method => (
                <tr key={method.method}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                    {method.method.replace(/_/g, ' ')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{method.count}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {method.byCurrency.map(c => money(c.amount, c.currency)).join(' · ')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{pkr(method.amountPKR)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
