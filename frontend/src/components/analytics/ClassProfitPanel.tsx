import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDownTrayIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { analyticsApi, ClassProfit, ClassProfitReport } from '../../api/analytics.api';
import { exportCsv, stampedFilename } from '../../utils/csv';
import AnalyticsTable from './AnalyticsTable';
import { terms } from '../../brand';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pkr = (amount: number) => `PKR ${Math.round(amount).toLocaleString()}`;

/** A class, or a salary that belongs to no class (salaried staff who teach none) */
type Row = ClassProfit & { staffOnly?: boolean };

/**
 * Sudo analytics, one month at a time. The same columns and rules as Course profitability on
 * the Financial tab: Revenue (when all pay) = Invoiced + Not invoiced, Invoiced = Paid + Not
 * received, against the expected salary slip.
 */
export default function ClassProfitPanel({ campus }: { campus: 'senior' | 'junior' | 'both' }) {
  const [data, setData] = useState<ClassProfitReport | null>(null);
  const [loading, setLoading] = useState(true);
  // null = the current month (the server decides, in Pakistan time)
  const [period, setPeriod] = useState<{ month: number; year: number } | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    analyticsApi.getClassProfit(campus, period?.month, period?.year)
      .then((report) => { if (seq === requestSeq.current) setData(report); })
      .catch((error) => {
        if (seq === requestSeq.current) toast.error(error.response?.data?.error || 'Failed to load the class profit');
      })
      .finally(() => { if (seq === requestSeq.current) setLoading(false); });
  }, [campus, period]);

  const step = (by: number) => {
    if (!data) return;
    const index = data.year * 12 + (data.month - 1) + by;
    setPeriod({ month: (index % 12) + 1, year: Math.floor(index / 12) });
  };

  // Salaries tied to no class are listed as rows of their own, so the totals are complete
  const rows: Row[] = [
    ...(data?.classes ?? []),
    ...(data?.teachers ?? []).filter((t) => t.unassignedPKR > 0).map((t): Row => ({
      courseId: `staff-${t.campus || ''}-${t.teacherId}`, title: `Salary not tied to a ${terms.courseLc}`, teachers: [t.name],
      oneToOne: false, students: 0, staffOnly: true, campus: t.campus,
      revenuePKR: 0, invoicedPKR: 0, notInvoicedPKR: 0, paidPKR: 0, notReceivedPKR: 0,
      teacherPayPKR: t.unassignedPKR, estimatedPayPKR: t.slipCount ? 0 : t.unassignedPKR,
      expectedProfitPKR: -t.unassignedPKR, profitSoFarPKR: -t.unassignedPKR,
    })),
  ];
  const sum = (pick: (row: Row) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const totals = {
    revenue: sum((r) => r.revenuePKR), invoiced: sum((r) => r.invoicedPKR), notInvoiced: sum((r) => r.notInvoicedPKR),
    paid: sum((r) => r.paidPKR), notReceived: sum((r) => r.notReceivedPKR), pay: sum((r) => r.teacherPayPKR),
  };
  const anyEstimate = rows.some((r) => r.estimatedPayPKR > 0.5);
  const title = data ? `${MONTHS[data.month - 1]} ${data.year}` : 'this month';
  const profitColor = (n: number) => (n >= 0 ? 'text-green-700' : 'text-red-600');
  const teacherNames = [...new Set(rows.flatMap((r) => r.teachers))].sort((a, b) => a.localeCompare(b));

  const handleExport = () => {
    if (!data || rows.length === 0) return toast.error('Nothing to export for this month');
    exportCsv(stampedFilename(`class-profit-${data.year}-${String(data.month).padStart(2, '0')}`), rows, [
      { header: terms.course, value: (r) => r.title },
      { header: 'Teacher', value: (r) => r.teachers.join(' / ') },
      { header: 'Type', value: (r) => (r.staffOnly ? 'Staff' : r.oneToOne ? '1-to-1' : 'Group') },
      { header: 'Students', value: (r) => r.students },
      { header: 'Revenue (PKR)', value: (r) => Math.round(r.revenuePKR) },
      { header: 'Invoiced (PKR)', value: (r) => Math.round(r.invoicedPKR) },
      { header: 'Not invoiced (PKR)', value: (r) => Math.round(r.notInvoicedPKR) },
      { header: 'Paid (PKR)', value: (r) => Math.round(r.paidPKR) },
      { header: 'Not received (PKR)', value: (r) => Math.round(r.notReceivedPKR) },
      { header: 'Teacher cost (PKR)', value: (r) => Math.round(r.teacherPayPKR) },
      { header: 'of which estimate (PKR)', value: (r) => Math.round(r.estimatedPayPKR) },
      { header: 'Expected profit (PKR)', value: (r) => Math.round(r.expectedProfitPKR) },
      { header: 'Profit so far (PKR)', value: (r) => Math.round(r.profitSoFarPKR) },
    ]);
    toast.success('Exported to CSV');
  };

  return (
    <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{terms.course} profit for {title}</h3>
          <p className="text-sm text-gray-500">One month at a time. The date range above does not apply here.</p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <button type="button" onClick={() => step(-1)} disabled={!data} aria-label="Previous month" className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setPeriod(null)} className="rounded-md px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50">This month</button>
          <button type="button" onClick={() => step(1)} disabled={!data} aria-label="Next month" className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* The month in four numbers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Revenue when all pay</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{pkr(totals.revenue)}</p>
          <p className="mt-1 text-xs text-gray-500">Invoiced {pkr(totals.invoiced)} · not invoiced yet {pkr(totals.notInvoiced)}</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Paid</p>
          <p className="mt-2 text-3xl font-bold text-green-700">{pkr(totals.paid)}</p>
          <p className="mt-1 text-xs text-gray-500">{totals.invoiced > 0 ? ((totals.paid / totals.invoiced) * 100).toFixed(1) : '0.0'}% of what is invoiced</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Not received</p>
          <p className="mt-2 text-3xl font-bold text-red-600">{pkr(totals.notReceived)}</p>
          <p className="mt-1 text-xs text-gray-500">Invoiced, fee date passed, not paid yet</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Expected profit</p>
          <p className={`mt-2 text-3xl font-bold ${profitColor(totals.revenue - totals.pay)}`}>{pkr(totals.revenue - totals.pay)}</p>
          <p className="mt-1 text-xs text-gray-500">
            Teacher cost {pkr(totals.pay)}{anyEstimate ? ' (part estimate)' : ''} · profit so far{' '}
            <span className={totals.paid - totals.pay >= 0 ? '' : 'text-red-600'}>{pkr(totals.paid - totals.pay)}</span>
          </p>
        </div>
      </div>

      <AnalyticsTable<Row>
        title={`Each ${terms.courseLc} in ${title}`}
        description="Revenue is what the class brings in when every student has paid: Invoiced (fee date has arrived) plus Not invoiced (fee dated later this month, or 1-to-1 classes not counted yet). Invoiced is Paid plus Not received. Teacher cost is the expected salary slip: the slip itself, or an estimate by the slip's own rules until it is made; a fixed monthly salary is split equally between that teacher's classes. Profit is fees less teacher pay only (other expenses are on the Expenses page). All in PKR."
        rows={rows}
        rowKey={(r) => `${r.campus || ''}-${r.courseId}`}
        searchPlaceholder={`Search ${terms.courseLc} or teacher...`}
        emptyText={loading ? 'Loading...' : `No fees or teacher pay for ${title}`}
        defaultSort={{ key: 'profit', direction: 'desc' }}
        actions={(
          <button onClick={handleExport} className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <ArrowDownTrayIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>
        )}
        filters={[
          { label: 'All results', options: [
            { label: 'Expected to make a profit', test: (r) => r.expectedProfitPKR > 0 },
            { label: 'Expected to make a loss', test: (r) => r.expectedProfitPKR < 0 },
            { label: 'In loss so far', test: (r) => r.profitSoFarPKR < 0 },
            { label: 'Has fees not received', test: (r) => r.notReceivedPKR > 0.5 },
            { label: 'No teacher cost', test: (r) => r.teacherPayPKR === 0 },
            { label: 'Teacher cost is an estimate', test: (r) => r.estimatedPayPKR > 0.5 },
          ] },
          { label: 'Group and 1-to-1', options: [
            { label: '1-to-1 only', test: (r) => r.oneToOne },
            { label: 'Group only', test: (r) => !r.oneToOne && !r.staffOnly },
          ] },
          { label: 'All teachers', options: teacherNames.map((name) => ({ label: name, test: (r: Row) => r.teachers.includes(name) })) },
        ]}
        columns={[
          {
            key: 'course', header: terms.course, value: (r) => r.title, className: (r) => (r.staffOnly ? 'italic text-gray-500' : 'text-gray-900'),
            cell: (r) => (
              <>
                {r.title}
                {r.campus && (
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs not-italic ${r.campus === 'junior' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-700'}`}>
                    {r.campus === 'junior' ? 'Junior' : 'Senior'}
                  </span>
                )}
              </>
            ),
          },
          { key: 'teacher', header: 'Teacher', value: (r) => r.teachers.join(', ') || null, className: 'text-gray-600' },
          { key: 'students', header: 'Students', align: 'right', value: (r) => r.students },
          { key: 'revenue', header: 'Revenue', align: 'right', value: (r) => r.revenuePKR, cell: (r) => pkr(r.revenuePKR), className: 'font-medium text-gray-900' },
          { key: 'invoiced', header: 'Invoiced', align: 'right', value: (r) => r.invoicedPKR, cell: (r) => pkr(r.invoicedPKR) },
          { key: 'notInvoiced', header: 'Not invoiced', align: 'right', value: (r) => r.notInvoicedPKR, cell: (r) => pkr(r.notInvoicedPKR), className: 'text-gray-500' },
          { key: 'paid', header: 'Paid', align: 'right', value: (r) => r.paidPKR, cell: (r) => pkr(r.paidPKR), className: 'text-green-700' },
          { key: 'notReceived', header: 'Not received', align: 'right', value: (r) => r.notReceivedPKR, cell: (r) => pkr(r.notReceivedPKR), className: (r) => (r.notReceivedPKR > 0 ? 'text-red-600' : 'text-gray-400') },
          {
            key: 'cost', header: 'Teacher cost', align: 'right', value: (r) => r.teacherPayPKR, className: 'text-gray-600',
            cell: (r) => (
              <>
                {pkr(r.teacherPayPKR)}
                {r.estimatedPayPKR > 0.5 && <div className="text-xs font-normal text-amber-600" title="No salary slip yet for part of this: worked out by the slip's own rules">{pkr(r.estimatedPayPKR)} estimate</div>}
              </>
            ),
          },
          { key: 'profit', header: 'Expected profit', align: 'right', value: (r) => r.expectedProfitPKR, cell: (r) => pkr(r.expectedProfitPKR), className: (r) => `font-medium ${profitColor(r.expectedProfitPKR)}` },
          { key: 'soFar', header: 'Profit so far', align: 'right', value: (r) => r.profitSoFarPKR, cell: (r) => pkr(r.profitSoFarPKR), className: (r) => profitColor(r.profitSoFarPKR) },
        ]}
        footer={(shown) => {
          const total = (pick: (r: Row) => number) => pkr(shown.reduce((s, r) => s + pick(r), 0));
          const cell = 'px-6 py-3 text-right whitespace-nowrap';
          return (
            <tr>
              <td className="px-6 py-3" colSpan={2}>Total ({shown.length})</td>
              <td className={cell}>{shown.reduce((s, r) => s + r.students, 0)}</td>
              <td className={cell}>{total((r) => r.revenuePKR)}</td>
              <td className={cell}>{total((r) => r.invoicedPKR)}</td>
              <td className={cell}>{total((r) => r.notInvoicedPKR)}</td>
              <td className={cell}>{total((r) => r.paidPKR)}</td>
              <td className={cell}>{total((r) => r.notReceivedPKR)}</td>
              <td className={cell}>{total((r) => r.teacherPayPKR)}</td>
              <td className={cell}>{total((r) => r.expectedProfitPKR)}</td>
              <td className={cell}>{total((r) => r.profitSoFarPKR)}</td>
            </tr>
          );
        }}
      />
    </div>
  );
}
