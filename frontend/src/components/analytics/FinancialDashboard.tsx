import { useState, useEffect } from 'react';
import { analyticsApi, FinancialAnalytics, AnalyticsQueryParams, CurrencyRevenue, CurrencyAmount, CourseProfitability, TeacherProfitability, StudentFinance } from '../../api/analytics.api';
import AnalyticsTable from './AnalyticsTable';
import FeeListModal, { FeeListRow } from '../fees/FeeListModal';
import ClassBreakdownModal, { BreakdownColumn } from './ClassBreakdownModal';
import { downloadXlsx } from '../../utils/xlsx';
import { currencyApi } from '../../api/currency.api';
import { CurrencyCode } from '../../api/enrollments.api';
import LineChart from './charts/LineChart';
import BarChart from './charts/BarChart';
import PieChart from './charts/PieChart';
import DeltaBadge from './DeltaBadge';
import { ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { exportCsv, stampedFilename } from '../../utils/csv';
import toast from 'react-hot-toast';
import { terms } from '../../brand';

interface FinancialDashboardProps {
  filters: AnalyticsQueryParams;
}

const pkr = (amount: number) =>
  `PKR ${Math.round(amount).toLocaleString()}`;

/** Every teacher named on the listed classes, A to Z (for the teacher filter) */
const teacherNames = (rows: CourseProfitability[]) =>
  [...new Set(rows.flatMap(row => row.teachers ?? []))].sort((a, b) => a.localeCompare(b));

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
  // Month filter on the two profitability tables: '' = the whole period above, or 'YYYY-MM'
  const [tableMonth, setTableMonth] = useState('');
  const [monthRows, setMonthRows] = useState<Pick<FinancialAnalytics, 'courseProfitability' | 'teacherProfitability'> | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  // The fees behind a teacher's Received / Not received figure (click the number)
  const [feeList, setFeeList] = useState<{
    title: string; subtitle: string; rows: FeeListRow[] | null;
    query: { startDate: string; endDate: string; group: 'received' | 'notReceived'; teacherId?: string | null; courseId?: string; campus?: 'senior' | 'junior' };
  } | null>(null);
  const loadFeeList = (list: NonNullable<typeof feeList>) => {
    analyticsApi.getProfitabilityFees(list.query)
      .then((rows) => setFeeList((current) => (current && current.query === list.query ? { ...current, rows } : current)))
      .catch(() => { toast.error('Failed to load the students'); setFeeList(null); });
  };
  const openFeeList = (list: NonNullable<typeof feeList>) => {
    setFeeList(list);
    loadFeeList(list);
  };
  // One class student by student (click any other figure in Course profitability)
  const [breakdown, setBreakdown] = useState<{
    title: string; subtitle: string; courseId: string; highlight?: BreakdownColumn; rows: StudentFinance[] | null;
  } | null>(null);

  // After "Mark paid": refresh the open list and the figures behind it
  const [refresh, setRefresh] = useState(0);
  const afterPaid = () => {
    if (feeList) loadFeeList(feeList);
    setRefresh((n) => n + 1);
  };

  useEffect(() => {
    fetchData();
    setTableMonth(''); // a new period or campus starts from the whole period again
  }, [filters]);

  // A fee was marked paid from the pop-up: bring the whole-period figures up to date quietly
  useEffect(() => {
    if (refresh > 0) analyticsApi.getFinancialAnalytics(filters).then(setData).catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (!tableMonth) {
      setMonthRows(null);
      return;
    }
    let current = true;
    const [year, month] = tableMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    setMonthLoading(true);
    analyticsApi.getProfitability({ startDate: `${tableMonth}-01`, endDate: `${tableMonth}-${String(lastDay).padStart(2, '0')}`, campus: filters.campus })
      .then((rows) => { if (current) setMonthRows(rows); })
      .catch((error: any) => { if (current) { toast.error(error.response?.data?.error || 'Failed to load that month'); setTableMonth(''); } })
      .finally(() => { if (current) setMonthLoading(false); });
    return () => { current = false; };
  }, [tableMonth, filters.campus, refresh]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const analytics = await analyticsApi.getFinancialAnalytics(filters);
      setData(analytics);
    } catch (error: any) {
      console.error('Failed to fetch financial analytics:', error);
      // e.g. the Junior portal could not be reached for the Junior / Both view
      toast.error(error.response?.data?.error || 'Failed to load financial analytics');
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

  const { totals, comparison, collectionRate } = data;
  // The tables show the chosen month, or the whole period when no month is picked
  const courseProfitability = (tableMonth && monthRows ? monthRows : data).courseProfitability;
  const teacherProfitability = (tableMonth && monthRows ? monthRows : data).teacherProfitability ?? [];

  // Every month of the period, newest first, for the month filter
  const monthOptions: { value: string; label: string }[] = [];
  {
    const [startYear, startMonth] = comparison.period.start.split('-').map(Number);
    const [endYear, endMonth] = comparison.period.end.split('-').map(Number);
    for (let index = endYear * 12 + endMonth - 1; index >= startYear * 12 + startMonth - 1; index--) {
      const year = Math.floor(index / 12);
      const month = (index % 12) + 1;
      monthOptions.push({
        value: `${year}-${String(month).padStart(2, '0')}`,
        label: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      });
    }
  }
  const monthLabel = monthOptions.find(option => option.value === tableMonth)?.label;

  // The dates the tables are showing right now: the chosen month, or the whole period
  const tablePeriod = (() => {
    if (!tableMonth) return { startDate: comparison.period.start, endDate: comparison.period.end, label: `${comparison.period.start.slice(0, 7)} to ${comparison.period.end.slice(0, 7)}` };
    const [year, month] = tableMonth.split('-').map(Number);
    return { startDate: `${tableMonth}-01`, endDate: `${tableMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`, label: monthLabel || tableMonth };
  })();
  /**
   * Course profitability as one line per student per class, for the classes on screen (after
   * search and filters, in the table's order). Each class's students add up to its row.
   */
  const exportStudentWise = async (shown: CourseProfitability[], applied: string[]) => {
    try {
      const all = await analyticsApi.getStudentBreakdown({ startDate: tablePeriod.startDate, endDate: tablePeriod.endDate, campus: filters.campus });
      // Campus only tells classes apart when both campuses are shown together
      const key = (campus: string | undefined, courseId: string) => (filters.campus === 'both' ? `${campus ?? ''}|${courseId}` : courseId);
      const order = new Map(shown.map((c, index) => [key(c.campus, c.courseId), index]));
      const titles = new Map(shown.map((c) => [key(c.campus, c.courseId), c.courseTitle]));
      const lines = all
        .filter((row) => order.has(key(row.campus, row.courseId)))
        .sort((a, b) => order.get(key(a.campus, a.courseId))! - order.get(key(b.campus, b.courseId))!);
      if (lines.length === 0) {
        toast.error('No students to export for these classes');
        return;
      }
      const money = (pick: (row: (typeof lines)[number]) => number) => Math.round(lines.reduce((sum, row) => sum + pick(row), 0) * 100) / 100;
      const r2 = (n: number) => Math.round(n * 100) / 100;
      downloadXlsx(`${terms.course} profitability student-wise ${tableMonth || `${comparison.period.start.slice(0, 7)} to ${comparison.period.end.slice(0, 7)}`}`, {
        sheetName: 'Student-wise',
        title: [
          `${terms.course} profitability, student by student`,
          monthLabel ? `Month: ${monthLabel}` : `Period: ${comparison.period.start.slice(0, 7)} to ${comparison.period.end.slice(0, 7)}`,
          applied.length ? `Filtered: ${applied.join(', ')}` : '',
        ].filter(Boolean),
        headers: [terms.course, 'Teacher', 'Type', 'Student', 'Revenue', 'Invoiced', 'Not invoiced', 'Received', 'Not received', 'Teacher cost', 'of which estimate', 'of which shared', 'Expected profit', 'Profit so far'],
        rows: lines.map((row) => [
          titles.get(key(row.campus, row.courseId)) ?? row.courseTitle,
          row.teachers.join(' / '),
          row.oneToOne ? '1-to-1' : 'Group',
          `${row.firstName} ${row.lastName}`.trim(),
          r2(row.revenuePKR), r2(row.invoicedPKR), r2(row.notInvoicedPKR), r2(row.paidPKR), r2(row.notReceivedPKR),
          r2(row.teacherPayPKR), r2(row.estimatedPayPKR), r2(row.sharedPayPKR), r2(row.expectedProfitPKR), r2(row.profitSoFarPKR),
        ]),
        totals: [
          `Total (${lines.length} lines, ${new Set(lines.map((row) => key(row.campus, row.courseId))).size} classes)`, null, null, null,
          money((row) => row.revenuePKR), money((row) => row.invoicedPKR), money((row) => row.notInvoicedPKR), money((row) => row.paidPKR), money((row) => row.notReceivedPKR),
          money((row) => row.teacherPayPKR), money((row) => row.estimatedPayPKR), money((row) => row.sharedPayPKR), money((row) => row.expectedProfitPKR), money((row) => row.profitSoFarPKR),
        ],
      });
      toast.success('Exported student-wise to Excel');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to prepare the student-wise export');
    }
  };

  /** Any other figure of a class: click it for the class student by student, that column highlighted */
  const drill = (c: CourseProfitability, highlight: BreakdownColumn | undefined, content: React.ReactNode) => (
    <button
      type="button"
      title="Show student by student"
      className="rounded px-1 text-right underline decoration-dotted underline-offset-2 hover:bg-indigo-100"
      onClick={() => {
        const opened = { title: c.courseTitle, subtitle: tablePeriod.label, courseId: c.courseId, highlight, rows: null };
        setBreakdown(opened);
        analyticsApi.getClassBreakdown({
          startDate: tablePeriod.startDate, endDate: tablePeriod.endDate, courseId: c.courseId,
          campus: c.campus ?? (filters.campus === 'junior' ? 'junior' : 'senior'),
        })
          .then((rows) => setBreakdown((current) => (current && current.courseId === opened.courseId ? { ...current, rows } : current)))
          .catch(() => { toast.error('Failed to load the students'); setBreakdown(null); });
      }}
    >
      {content}
    </button>
  );

  /** A Received / Not received figure of a teacher or a class: click it for the students and fees behind it */
  const feeCell = (
    t: { name: string; campus?: 'senior' | 'junior'; teacherId?: string | null; courseId?: string },
    group: 'received' | 'notReceived',
    amount: number,
  ) => (amount > 0.5 ? (
    <button
      type="button"
      title="Show these students"
      className="rounded px-1 underline decoration-dotted underline-offset-2 hover:bg-indigo-100"
      onClick={() => openFeeList({
        title: `${t.name}: ${group === 'received' ? 'received' : 'not received'}`,
        subtitle: `${group === 'received' ? 'Fees received' : 'Fee date passed, not paid yet'} · ${tablePeriod.label}`,
        rows: null,
        query: {
          startDate: tablePeriod.startDate, endDate: tablePeriod.endDate, group,
          ...(t.courseId ? { courseId: t.courseId } : { teacherId: t.teacherId ?? null }),
          campus: t.campus ?? (filters.campus === 'junior' ? 'junior' : 'senior'),
        },
      })}
    >
      {pkr(amount)}
    </button>
  ) : pkr(amount));
  const monthFilter = (
    <select
      value={tableMonth}
      onChange={(e) => setTableMonth(e.target.value)}
      aria-label="Month"
      className={`rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 ${tableMonth ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-gray-300'} ${monthLoading ? 'opacity-60' : ''}`}
    >
      <option value="">Whole period ({comparison.period.start.slice(0, 7)} to {comparison.period.end.slice(0, 7)})</option>
      {monthOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
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
      stampedFilename(`course-profitability${tableMonth ? `-${tableMonth}` : ''}`),
      courseProfitability,
      [
        { header: terms.course, value: c => c.courseTitle },
        { header: 'Teacher', value: c => c.teachers.join(' / ') },
        { header: 'Type', value: c => (c.oneToOne ? '1-to-1' : 'Group') },
        { header: 'Students', value: c => c.studentCount },
        { header: 'Revenue (PKR)', value: c => Math.round(c.revenuePKR) },
        { header: 'Invoiced (PKR)', value: c => Math.round(c.invoicedPKR) },
        { header: 'Not invoiced (PKR)', value: c => Math.round(c.notInvoicedPKR) },
        { header: 'Received (PKR)', value: c => Math.round(c.paidPKR) },
        { header: 'Not received (PKR)', value: c => Math.round(c.notReceivedPKR) },
        { header: 'Teacher cost (PKR)', value: c => Math.round(c.teacherCostPKR) },
        { header: 'of which estimate (PKR)', value: c => Math.round(c.estimatedCostPKR) },
        { header: 'Expected profit (PKR)', value: c => Math.round(c.expectedProfitPKR) },
        { header: 'Profit so far (PKR)', value: c => Math.round(c.profitSoFarPKR) },
        { header: 'Margin %', value: c => c.marginPercent.toFixed(1) },
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

      {/* Key figures, on the same basis as the profitability tables below:
          revenue = invoiced + not invoiced, and invoiced = paid + not received */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Revenue when all pay</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{pkr(totals.revenuePKR)}</p>
          <p className="mt-1 text-xs text-gray-500">
            Invoiced {pkr(totals.invoicedPKR)} · not invoiced yet {pkr(totals.notInvoicedPKR)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Received</p>
          <p className="mt-2 text-3xl font-bold text-green-700">{pkr(totals.paidPKR)}</p>
          <p className="mt-1 text-xs text-gray-500">
            {totals.invoicedPKR > 0 ? ((totals.paidPKR / totals.invoicedPKR) * 100).toFixed(1) : '0.0'}% of what is invoiced
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Not received</p>
          <p className="mt-2 text-3xl font-bold text-red-600">{pkr(totals.notReceivedPKR)}</p>
          <p className="mt-1 text-xs text-gray-500">Invoiced, fee date passed, not paid yet</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Expected profit</p>
          <p className={`mt-2 text-3xl font-bold ${totals.profitPKR >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {pkr(totals.profitPKR)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Teacher cost {pkr(totals.teacherCostPKR)} · profit so far{' '}
            <span className={totals.profitSoFarPKR >= 0 ? '' : 'text-red-600'}>{pkr(totals.profitSoFarPKR)}</span>
          </p>
        </div>
      </div>
      <p className="-mt-3 text-xs text-gray-500">
        These figures count fees by the month they are for, from {comparison.period.start.slice(0, 7)} to {comparison.period.end.slice(0, 7)}.
        Money that arrived in this period, by the day it was paid: {pkr(totals.collectedPKR)}
        {comparison.revenuePKR.changePercent !== null && <> (<DeltaBadge changePercent={comparison.revenuePKR.changePercent} /> on the period before)</>}. Outstanding on all fees, any month: {pkr(outstandingPKR)}.
      </p>

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

      {/* Course profitability: sort by any heading, search a class or teacher, filter */}
      <AnalyticsTable<CourseProfitability>
        title={`${terms.course} profitability${monthLabel ? ` · ${monthLabel}` : ''}`}
        actions={monthFilter}
        exportSum={['students', 'revenue', 'invoiced', 'notInvoiced', 'paid', 'notReceived', 'cost', 'profit', 'soFar']}
        exportNote={monthLabel ? `Month: ${monthLabel}` : `Period: ${comparison.period.start.slice(0, 7)} to ${comparison.period.end.slice(0, 7)}`}
        description="Revenue is what the class brings in when every student has paid: Invoiced (fee date has arrived) plus Not invoiced (fee dated later, or 1-to-1 classes not counted yet). Invoiced is Received plus Not received. Teacher cost is the expected salary slip; a fixed monthly salary is split equally between that teacher's classes. All in PKR. Click any figure to see it student by student; Received and Not received open the fees themselves, where you can mark them paid."
        rows={courseProfitability}
        extraExport={{ label: 'Excel (student-wise)', title: 'One line per student in each class shown, with the same columns', run: exportStudentWise }}
        rowKey={(c, i) => `${c.courseId}-${i}`}
        searchPlaceholder={`Search ${terms.courseLc} or teacher...`}
        emptyText={`No ${terms.courseLc} fees in this period`}
        defaultSort={{ key: 'profit', direction: 'desc' }}
        filters={[
          { label: 'All results', options: [
            { label: 'Expected to make a profit', test: c => c.expectedProfitPKR > 0 },
            { label: 'Expected to make a loss', test: c => c.expectedProfitPKR < 0 },
            { label: 'In loss so far', test: c => c.profitSoFarPKR < 0 },
            { label: 'Has fees not received', test: c => c.notReceivedPKR > 0.5 },
            { label: 'No teacher cost', test: c => c.teacherCostPKR === 0 },
          ] },
          { label: 'Group and 1-to-1', options: [
            { label: '1-to-1 only', test: c => c.oneToOne },
            { label: 'Group only', test: c => !c.oneToOne },
          ] },
          { label: 'All teachers', options: teacherNames(courseProfitability).map(name => ({ label: name, test: (c: CourseProfitability) => c.teachers.includes(name) })) },
        ]}
        columns={[
          { key: 'course', header: terms.course, value: c => c.courseTitle },
          { key: 'teacher', header: 'Teacher', value: c => c.teachers.join(', ') || null, className: 'text-gray-600' },
          { key: 'students', header: 'Students', align: 'right', value: c => c.studentCount, cell: c => drill(c, undefined, c.studentCount) },
          { key: 'revenue', header: 'Revenue', align: 'right', value: c => c.revenuePKR, cell: c => drill(c, 'revenue', pkr(c.revenuePKR)), className: 'font-medium text-gray-900' },
          { key: 'invoiced', header: 'Invoiced', align: 'right', value: c => c.invoicedPKR, cell: c => drill(c, 'invoiced', pkr(c.invoicedPKR)) },
          { key: 'notInvoiced', header: 'Not invoiced', align: 'right', value: c => c.notInvoicedPKR, cell: c => drill(c, 'notInvoiced', pkr(c.notInvoicedPKR)), className: 'text-gray-500' },
          { key: 'paid', header: 'Received', align: 'right', value: c => c.paidPKR, cell: c => feeCell({ name: c.courseTitle, campus: c.campus, courseId: c.courseId }, 'received', c.paidPKR), className: 'text-green-700' },
          { key: 'notReceived', header: 'Not received', align: 'right', value: c => c.notReceivedPKR, cell: c => feeCell({ name: c.courseTitle, campus: c.campus, courseId: c.courseId }, 'notReceived', c.notReceivedPKR), className: c => (c.notReceivedPKR > 0 ? 'text-red-600' : 'text-gray-400') },
          {
            key: 'cost', header: 'Teacher cost', align: 'right', value: c => c.teacherCostPKR, className: 'text-gray-600',
            cell: c => (
              <>
                {drill(c, 'cost', pkr(c.teacherCostPKR))}
                {c.estimatedCostPKR > 0.5 && <div className="text-xs font-normal text-amber-600" title="No salary slip yet for part of this: worked out by the slip's own rules">{pkr(c.estimatedCostPKR)} estimate</div>}
              </>
            ),
          },
          { key: 'profit', header: 'Expected profit', align: 'right', value: c => c.expectedProfitPKR, cell: c => drill(c, 'profit', pkr(c.expectedProfitPKR)), className: c => `font-medium ${c.expectedProfitPKR >= 0 ? 'text-green-700' : 'text-red-600'}` },
          { key: 'soFar', header: 'Profit so far', align: 'right', value: c => c.profitSoFarPKR, cell: c => drill(c, 'soFar', pkr(c.profitSoFarPKR)), className: c => (c.profitSoFarPKR >= 0 ? 'text-green-700' : 'text-red-600') },
          { key: 'margin', header: 'Margin', align: 'right', value: c => c.marginPercent, cell: c => drill(c, 'profit', `${c.marginPercent.toFixed(1)}%`), className: c => (c.marginPercent >= 0 ? 'text-gray-900' : 'text-red-600') },
        ]}
        footer={shown => {
          const sum = (pick: (c: (typeof shown)[number]) => number) => pkr(shown.reduce((s, c) => s + pick(c), 0));
          const cell = 'px-6 py-3 text-right whitespace-nowrap';
          return (
            <tr>
              <td className="px-6 py-3" colSpan={2}>Total ({shown.length})</td>
              <td className={cell}>{shown.reduce((s, c) => s + c.studentCount, 0)}</td>
              <td className={cell}>{sum(c => c.revenuePKR)}</td>
              <td className={cell}>{sum(c => c.invoicedPKR)}</td>
              <td className={cell}>{sum(c => c.notInvoicedPKR)}</td>
              <td className={cell}>{sum(c => c.paidPKR)}</td>
              <td className={cell}>{sum(c => c.notReceivedPKR)}</td>
              <td className={cell}>{sum(c => c.teacherCostPKR)}</td>
              <td className={cell}>{sum(c => c.expectedProfitPKR)}</td>
              <td className={cell}>{sum(c => c.profitSoFarPKR)}</td>
            </tr>
          );
        }}
      />

      {/* Teacher profitability: the same columns, per teacher */}
      <AnalyticsTable<TeacherProfitability>
        title={`Teacher profitability${monthLabel ? ` · ${monthLabel}` : ''}`}
        actions={monthFilter}
        exportSum={['classes', 'students', 'revenue', 'invoiced', 'notInvoiced', 'paid', 'notReceived', 'cost', 'profit', 'soFar', 'slips']}
        exportNote={monthLabel ? `Month: ${monthLabel}` : `Period: ${comparison.period.start.slice(0, 7)} to ${comparison.period.end.slice(0, 7)}`}
        description="The same figures per teacher: the money from their classes against everything they are paid in the period. A class with two teachers is split equally between them. Click a Received or Not received figure to see the students."
        rows={teacherProfitability}
        rowKey={(t, i) => `${t.teacherId ?? 'none'}-${i}`}
        searchPlaceholder="Search teacher..."
        emptyText="No fees or teacher pay in this period"
        defaultSort={{ key: 'profit', direction: 'desc' }}
        filters={[
          { label: 'All results', options: [
            { label: 'Expected to make a profit', test: t => t.expectedProfitPKR > 0 },
            { label: 'Expected to make a loss', test: t => t.expectedProfitPKR < 0 },
            { label: 'In loss so far', test: t => t.profitSoFarPKR < 0 },
            { label: 'Paid, but no class revenue', test: t => t.revenuePKR === 0 && t.teacherCostPKR > 0 },
            { label: 'Revenue, but no pay recorded', test: t => t.revenuePKR > 0 && t.teacherCostPKR === 0 },
          ] },
        ]}
        columns={[
          { key: 'teacher', header: 'Teacher', value: t => t.teacherName, className: t => (t.teacherId ? 'text-gray-900' : 'italic text-gray-500') },
          { key: 'classes', header: terms.courses, align: 'right', value: t => t.classCount },
          { key: 'students', header: 'Students', align: 'right', value: t => t.studentCount },
          { key: 'revenue', header: 'Revenue', align: 'right', value: t => t.revenuePKR, cell: t => pkr(t.revenuePKR), className: 'font-medium text-gray-900' },
          { key: 'invoiced', header: 'Invoiced', align: 'right', value: t => t.invoicedPKR, cell: t => pkr(t.invoicedPKR) },
          { key: 'notInvoiced', header: 'Not invoiced', align: 'right', value: t => t.notInvoicedPKR, cell: t => pkr(t.notInvoicedPKR), className: 'text-gray-500' },
          { key: 'paid', header: 'Received', align: 'right', value: t => t.paidPKR, cell: t => feeCell({ name: t.teacherName, campus: t.campus, teacherId: t.teacherId }, 'received', t.paidPKR), className: 'text-green-700' },
          { key: 'notReceived', header: 'Not received', align: 'right', value: t => t.notReceivedPKR, cell: t => feeCell({ name: t.teacherName, campus: t.campus, teacherId: t.teacherId }, 'notReceived', t.notReceivedPKR), className: t => (t.notReceivedPKR > 0 ? 'text-red-600' : 'text-gray-400') },
          {
            key: 'cost', header: 'Teacher cost', align: 'right', value: t => t.teacherCostPKR, className: 'text-gray-600',
            cell: t => (
              <>
                {pkr(t.teacherCostPKR)}
                {t.estimatedCostPKR > 0.5 && <div className="text-xs font-normal text-amber-600" title="No salary slip yet for part of this: worked out by the slip's own rules">{pkr(t.estimatedCostPKR)} estimate</div>}
              </>
            ),
          },
          { key: 'profit', header: 'Expected profit', align: 'right', value: t => t.expectedProfitPKR, cell: t => pkr(t.expectedProfitPKR), className: t => `font-medium ${t.expectedProfitPKR >= 0 ? 'text-green-700' : 'text-red-600'}` },
          { key: 'soFar', header: 'Profit so far', align: 'right', value: t => t.profitSoFarPKR, cell: t => pkr(t.profitSoFarPKR), className: t => (t.profitSoFarPKR >= 0 ? 'text-green-700' : 'text-red-600') },
          { key: 'slips', header: 'Slips', align: 'right', value: t => t.slipCount, className: 'text-gray-500' },
        ]}
        footer={shown => {
          const sum = (pick: (t: (typeof shown)[number]) => number) => pkr(shown.reduce((s, t) => s + pick(t), 0));
          const cell = 'px-6 py-3 text-right whitespace-nowrap';
          return (
            <tr>
              <td className="px-6 py-3" colSpan={3}>Total ({shown.length})</td>
              <td className={cell}>{sum(t => t.revenuePKR)}</td>
              <td className={cell}>{sum(t => t.invoicedPKR)}</td>
              <td className={cell}>{sum(t => t.notInvoicedPKR)}</td>
              <td className={cell}>{sum(t => t.paidPKR)}</td>
              <td className={cell}>{sum(t => t.notReceivedPKR)}</td>
              <td className={cell}>{sum(t => t.teacherCostPKR)}</td>
              <td className={cell}>{sum(t => t.expectedProfitPKR)}</td>
              <td className={cell}>{sum(t => t.profitSoFarPKR)}</td>
            </tr>
          );
        }}
      />

      {/* One class student by student */}
      {breakdown && (
        <ClassBreakdownModal
          title={breakdown.title}
          subtitle={breakdown.subtitle}
          courseId={breakdown.courseId}
          highlight={breakdown.highlight}
          rows={breakdown.rows}
          onClose={() => setBreakdown(null)}
        />
      )}

      {/* The students behind a Received / Not received figure: the same pop-up as the dashboard */}
      {feeList && (
        <FeeListModal
          title={feeList.title}
          subtitle={feeList.subtitle}
          rows={feeList.rows}
          onClose={() => setFeeList(null)}
          onPaid={afterPaid}
        />
      )}

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
