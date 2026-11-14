import { Fragment, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { dashboardApi, Campus, FeeGroup, FeeOverview } from '../../api/dashboard.api';
import { terms } from '../../brand';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SYMBOLS: Record<string, string> = { PKR: 'PKR', USD: '$', GBP: '£', SAR: 'SR' };

const money = (group: FeeGroup) => group.amounts
  .filter((a) => parseFloat(a.amount) > 0)
  .map((a) => `${SYMBOLS[a.currency] || a.currency} ${Math.round(parseFloat(a.amount)).toLocaleString()}`)
  .join(' + ');

/**
 * Sudo dashboard: one month's fees at a glance (students and fees: total, paid, pending,
 * overdue), then each teacher's classes with the students enrolled and how many have paid.
 */
export default function FeeOverviewPanel({ campus }: { campus: Campus }) {
  const [data, setData] = useState<FeeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  // null = the current month (the server decides, in Pakistan time)
  const [period, setPeriod] = useState<{ month: number; year: number } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    dashboardApi.getFeeOverview(campus, period?.month, period?.year)
      .then((result) => { if (seq === requestSeq.current) setData(result); })
      .catch(() => { if (seq === requestSeq.current) toast.error('Failed to load the fee overview'); })
      .finally(() => { if (seq === requestSeq.current) setLoading(false); });
  }, [campus, period]);

  const step = (by: number) => {
    if (!data) return;
    const index = data.year * 12 + (data.month - 1) + by;
    setPeriod({ month: (index % 12) + 1, year: Math.floor(index / 12) });
  };

  const toggle = (key: string) => setOpen((current) => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  });

  const tiles: { label: string; group: FeeGroup | undefined; border: string; text: string }[] = [
    { label: 'Total', group: data?.total, border: 'border-blue-500', text: 'text-gray-900' },
    { label: 'Paid', group: data?.paid, border: 'border-emerald-500', text: 'text-emerald-700' },
    { label: 'Pending', group: data?.pending, border: 'border-orange-500', text: 'text-orange-600' },
    { label: 'Overdue', group: data?.overdue, border: 'border-red-500', text: 'text-red-600' },
  ];

  const query = search.trim().toLowerCase();
  const teachers = (data?.teachers ?? []).filter((t) =>
    !query || t.name.toLowerCase().includes(query) || t.classes.some((c) => c.title.toLowerCase().includes(query)));
  // Students enrolled whose fee for the month is not owed (on leave, dropped, or none made yet)
  const noFee = (row: { enrolled: number; paid: number; pending: number; overdue: number }) =>
    Math.max(0, row.enrolled - row.paid - row.pending - row.overdue);

  return (
    <div className={`mb-8 ${loading ? 'opacity-60' : ''}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">
          Fees for {data ? `${MONTHS[data.month - 1]} ${data.year}` : 'this month'}
        </h2>
        <div className="inline-flex items-center gap-1 rounded-lg bg-white p-1 shadow-card">
          <button type="button" onClick={() => step(-1)} disabled={!data} aria-label="Previous month" className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setPeriod(null)} className="rounded-md px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
            This month
          </button>
          <button type="button" onClick={() => step(1)} disabled={!data} aria-label="Next month" className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40">
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 1. The month in four numbers */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ label, group, border, text }) => (
          <div key={label} className={`rounded-xl border-l-4 bg-white p-6 shadow-card ${border}`}>
            <h3 className="text-sm font-medium text-gray-500">{label}</h3>
            <p className={`mt-2 text-3xl font-bold ${text}`}>
              {group?.students ?? 0} <span className="text-base font-medium text-gray-500">student{group?.students === 1 ? '' : 's'}</span>
            </p>
            <p className="mt-1 text-sm text-gray-600">{group?.fees ?? 0} fee{group?.fees === 1 ? '' : 's'}</p>
            <p className="mt-1 text-xs text-gray-400">{group && money(group) ? money(group) : '-'}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        A student is counted once: Overdue if any of their fees is overdue, otherwise Pending if any is still pending, otherwise Paid.
        Dropped and on-leave fees are not counted.
      </p>

      {/* 2. Each teacher's classes */}
      <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Teachers' {terms.coursesLc}: students enrolled and fees paid</h3>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teacher or class..."
            className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Teacher / {terms.courses}</th>
                <th className="px-4 py-2 text-right font-medium">Enrolled</th>
                <th className="px-4 py-2 text-right font-medium">Paid</th>
                <th className="px-4 py-2 text-right font-medium">Pending</th>
                <th className="px-4 py-2 text-right font-medium">Overdue</th>
                <th className="px-4 py-2 text-right font-medium" title="Enrolled, but no fee owed this month: on leave, dropped, or not made yet">No fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {teachers.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">{loading ? 'Loading...' : 'No teachers with enrolled students'}</td></tr>
              )}
              {teachers.map((teacher) => {
                const key = `${teacher.campus || ''}-${teacher.teacherId}`;
                const expanded = open.has(key) || !!query;
                return (
                  <Fragment key={key}>
                    <tr onClick={() => toggle(key)} className="cursor-pointer bg-white font-medium text-gray-900 hover:bg-indigo-50/40">
                      <td className="px-4 py-2">
                        <ChevronDownIcon className={`mr-1 inline h-4 w-4 text-gray-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                        {teacher.name}
                        {teacher.campus && (
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-normal ${teacher.campus === 'junior' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-700'}`}>
                            {teacher.campus === 'junior' ? 'Junior' : 'Senior'}
                          </span>
                        )}
                        <span className="ml-2 text-xs font-normal text-gray-400">{teacher.classes.length} {teacher.classes.length === 1 ? 'class' : 'classes'}</span>
                      </td>
                      <td className="px-4 py-2 text-right">{teacher.enrolled}</td>
                      <td className="px-4 py-2 text-right text-emerald-700">{teacher.paid}</td>
                      <td className="px-4 py-2 text-right text-orange-600">{teacher.pending}</td>
                      <td className="px-4 py-2 text-right text-red-600">{teacher.overdue}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{noFee(teacher)}</td>
                    </tr>
                    {expanded && teacher.classes.map((cls) => (
                      <tr key={cls.courseId} className="bg-gray-50 text-gray-600">
                        <td className="px-4 py-1.5 pl-10">{cls.title}</td>
                        <td className="px-4 py-1.5 text-right">{cls.enrolled}</td>
                        <td className="px-4 py-1.5 text-right text-emerald-700">{cls.paid}</td>
                        <td className="px-4 py-1.5 text-right text-orange-600">{cls.pending}</td>
                        <td className="px-4 py-1.5 text-right text-red-600">{cls.overdue}</td>
                        <td className="px-4 py-1.5 text-right text-gray-400">{noFee(cls)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
          Click a teacher to see each class. A teacher's row adds up their classes, so a student in two of their classes is counted twice there.
        </p>
      </div>
    </div>
  );
}
