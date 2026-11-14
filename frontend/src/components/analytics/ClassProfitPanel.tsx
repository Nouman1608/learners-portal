import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDownTrayIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { analyticsApi, ClassProfit, ClassProfitReport } from '../../api/analytics.api';
import { exportCsv, stampedFilename } from '../../utils/csv';
import { useSortableData } from '../../hooks/useSortableData';
import { terms } from '../../brand';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SYMBOLS: Record<string, string> = { PKR: 'PKR', USD: '$', GBP: '£', SAR: 'SR' };
const pkr = (amount: number) => `PKR ${Math.round(amount).toLocaleString()}`;
/** Amounts billed in another currency, e.g. "$ 120", shown under the PKR figure */
const foreign = (amounts: { currency: string; amount: number }[]) => amounts
  .filter((a) => a.currency !== 'PKR' && a.amount > 0)
  .map((a) => `${SYMBOLS[a.currency] || a.currency} ${Math.round(a.amount).toLocaleString()}`)
  .join(' + ');

/**
 * Sudo analytics: for each class in a month, the fees due and received from its students,
 * what its teacher is paid for it, and the profit. Teacher pay is the salary slip's figure,
 * or an estimate by the slip's own rules until the slip is made.
 */
export default function ClassProfitPanel({ campus }: { campus: 'senior' | 'junior' | 'both' }) {
  const [data, setData] = useState<ClassProfitReport | null>(null);
  const [loading, setLoading] = useState(true);
  // null = the current month (the server decides, in Pakistan time)
  const [period, setPeriod] = useState<{ month: number; year: number } | null>(null);
  const [search, setSearch] = useState('');
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

  const query = search.trim().toLowerCase();
  const rows = useMemo(() => (data?.classes ?? []).filter((c) =>
    !query || c.title.toLowerCase().includes(query) || c.teachers.some((t) => t.toLowerCase().includes(query))), [data, query]);
  const { items: sorted, requestSort, getSortIndicator } = useSortableData(rows);

  const sum = (pick: (c: ClassProfit) => number) => rows.reduce((total, c) => total + pick(c), 0);
  const unassigned = query ? [] : data?.unassigned ?? [];
  const otherPay = unassigned.reduce((total, u) => total + u.payPKR, 0);
  const totals = {
    due: sum((c) => c.duePKR),
    received: sum((c) => c.receivedPKR),
    pay: sum((c) => c.teacherPayPKR) + otherPay,
  };
  const anyEstimate = rows.some((c) => c.payEstimated) || unassigned.some((u) => u.estimated);
  const title = data ? `${MONTHS[data.month - 1]} ${data.year}` : 'this month';

  const handleExport = () => {
    if (!data || rows.length === 0) return toast.error('Nothing to export for this month');
    exportCsv(stampedFilename(`class-profit-${data.year}-${String(data.month).padStart(2, '0')}`), sorted, [
      { header: terms.course, value: (c) => c.title },
      { header: 'Teacher', value: (c) => c.teachers.join(' / ') },
      { header: 'Students', value: (c) => c.students },
      { header: 'Fee due (PKR)', value: (c) => Math.round(c.duePKR) },
      { header: 'Fee received (PKR)', value: (c) => Math.round(c.receivedPKR) },
      { header: 'Teacher pay (PKR)', value: (c) => Math.round(c.teacherPayPKR) },
      { header: 'Teacher pay is', value: (c) => (c.payEstimated ? 'estimate' : 'salary slip') },
      { header: 'Profit on received (PKR)', value: (c) => Math.round(c.profitPKR) },
      { header: 'Profit if all pay (PKR)', value: (c) => Math.round(c.expectedProfitPKR) },
    ]);
    toast.success('Exported to CSV');
  };

  const th = (label: string, key: string, align = 'text-right') => (
    <th onClick={() => requestSort(key)} className={`cursor-pointer px-4 py-3 text-xs font-medium uppercase text-gray-500 hover:bg-gray-100 ${align}`}>
      {label} {getSortIndicator(key)}
    </th>
  );
  const profitColor = (n: number) => (n >= 0 ? 'text-green-700' : 'text-red-600');

  return (
    <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{terms.course} profit for {title}</h3>
          <p className="text-sm text-gray-500">Fees from each {terms.courseLc}'s students, what the teacher is paid for it, and what is left. The date range above does not apply here.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <button type="button" onClick={() => step(-1)} disabled={!data} aria-label="Previous month" className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setPeriod(null)} className="rounded-md px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50">This month</button>
            <button type="button" onClick={() => step(1)} disabled={!data} aria-label="Next month" className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
          <button onClick={handleExport} className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <ArrowDownTrayIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </div>

      {/* The month in five numbers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {[
          ['Fee due', pkr(totals.due), 'text-gray-900'],
          ['Fee received', pkr(totals.received), 'text-gray-900'],
          [`Teacher pay${anyEstimate ? ' (part estimate)' : ''}`, pkr(totals.pay), 'text-gray-900'],
          ['Profit on received', pkr(totals.received - totals.pay), profitColor(totals.received - totals.pay)],
          ['Profit if all pay', pkr(totals.due - totals.pay), profitColor(totals.due - totals.pay)],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-lg bg-white p-4 shadow">
            <p className="text-sm font-medium text-gray-600">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-500">
            {rows.length} {rows.length === 1 ? terms.courseLc : terms.coursesLc}. Click a column heading to sort.
          </p>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search class or teacher..."
            className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-gray-500">{loading ? 'Loading...' : `No fees or teacher pay for ${title}`}</p>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr>
                  {th(terms.course, 'title', 'text-left')}
                  {th('Teacher', 'teachers', 'text-left')}
                  {th('Students', 'students')}
                  {th('Fee due', 'duePKR')}
                  {th('Received', 'receivedPKR')}
                  {th('Teacher pay', 'teacherPayPKR')}
                  {th('Profit on received', 'profitPKR')}
                  {th('Profit if all pay', 'expectedProfitPKR')}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white text-sm">
                {sorted.map((c) => (
                  <tr key={`${c.campus || ''}-${c.courseId}`} className="hover:bg-indigo-50/30">
                    <td className="px-4 py-3 text-gray-900">
                      {c.title}
                      {c.campus && (
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${c.campus === 'junior' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-700'}`}>
                          {c.campus === 'junior' ? 'Junior' : 'Senior'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.teachers.join(', ') || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-gray-900">{c.students}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-gray-900">
                      {pkr(c.duePKR)}
                      {foreign(c.due) && <div className="text-xs text-gray-400">{foreign(c.due)}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-gray-900">
                      {pkr(c.receivedPKR)}
                      {foreign(c.received) && <div className="text-xs text-gray-400">{foreign(c.received)}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700">
                      {pkr(c.teacherPayPKR)}
                      {c.payEstimated && <div className="text-xs text-amber-600" title="The salary slip for this month is not made yet">estimate</div>}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${profitColor(c.profitPKR)}`}>{pkr(c.profitPKR)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right ${profitColor(c.expectedProfitPKR)}`}>{pkr(c.expectedProfitPKR)}</td>
                  </tr>
                ))}
                {unassigned.map((u) => (
                  <tr key={`staff-${u.campus || ''}-${u.teacherId}`} className="bg-gray-50 text-gray-600">
                    <td className="px-4 py-3 italic">Salary not tied to a {terms.courseLc}</td>
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3" /><td className="px-4 py-3" /><td className="px-4 py-3" />
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {pkr(u.payPKR)}
                      {u.estimated && <div className="text-xs text-amber-600">estimate</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-red-600">{pkr(-u.payPKR)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-red-600">{pkr(-u.payPKR)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-gray-100 text-sm font-semibold text-gray-900">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right">{sum((c) => c.students)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{pkr(totals.due)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{pkr(totals.received)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{pkr(totals.pay)}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right ${profitColor(totals.received - totals.pay)}`}>{pkr(totals.received - totals.pay)}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right ${profitColor(totals.due - totals.pay)}`}>{pkr(totals.due - totals.pay)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
          Profit here is fees less teacher pay only (rent and other expenses are on the Expenses page). Teacher pay marked "estimate" is worked out
          by the salary slip's own rules because the slip for the month is not made yet; it becomes exact once the slip exists. A fixed monthly
          salary is split equally between that teacher's {terms.coursesLc}. Fees in other currencies are converted to PKR at the portal's rates.
          The students total counts a student once per {terms.courseLc}.
        </p>
      </div>
    </div>
  );
}
