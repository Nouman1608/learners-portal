import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import MarkAsReceivedModal from '../fees/MarkAsReceivedModal';
import { Fee } from '../../api/enrollments.api';
import { dashboardApi, Campus, FeeGroup, FeeOverview, FeeOverviewStatus, FeeOverviewStudent } from '../../api/dashboard.api';
import { terms, isJuniorPortal } from '../../brand';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SYMBOLS: Record<string, string> = { PKR: 'PKR', USD: '$', GBP: '£', SAR: 'SR' };

const money = (group: FeeGroup) => group.amounts
  .filter((a) => parseFloat(a.amount) > 0)
  .map((a) => `${SYMBOLS[a.currency] || a.currency} ${Math.round(parseFloat(a.amount)).toLocaleString()}`)
  .join(' + ');

const STATUS_LABEL: Record<FeeOverviewStatus, string> = {
  total: 'All students', enrolled: 'Enrolled', paid: 'Paid', pending: 'Pending', overdue: 'Overdue', nofee: 'No fee this month',
};
const FEE_BADGE: Record<string, string> = {
  received: 'bg-emerald-100 text-emerald-800', pending: 'bg-orange-100 text-orange-800', overdue: 'bg-red-100 text-red-800',
};

/** The list opened by clicking a number: which students, and a title saying what was clicked */
interface Drill {
  title: string;
  status: FeeOverviewStatus;
  campus: Campus;
  teacherId?: string;
  courseId?: string;
}

/**
 * Admin / sudo dashboard: one month's fees at a glance (students and fees: total, paid, pending,
 * overdue), then each teacher's classes with the students enrolled and how many have paid.
 * Every number opens the list of students behind it; a student's name goes to Enrollments.
 */
export default function FeeOverviewPanel({ campus }: { campus: Campus }) {
  const [data, setData] = useState<FeeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  // null = the current month (the server decides, in Pakistan time)
  const [period, setPeriod] = useState<{ month: number; year: number } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const requestSeq = useRef(0);

  const [drill, setDrill] = useState<Drill | null>(null);
  const [students, setStudents] = useState<FeeOverviewStudent[] | null>(null);
  // The fee being marked as paid from the list (same pop-up as the Fees page)
  const [feeToMark, setFeeToMark] = useState<Fee | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    dashboardApi.getFeeOverview(campus, period?.month, period?.year)
      .then((result) => { if (seq === requestSeq.current) setData(result); })
      .catch(() => { if (seq === requestSeq.current) toast.error('Failed to load the fee overview'); })
      .finally(() => { if (seq === requestSeq.current) setLoading(false); });
  }, [campus, period, reload]);

  const loadStudents = (of: Drill) => {
    if (!data) return;
    dashboardApi.getFeeOverviewStudents({
      month: data.month, year: data.year, status: of.status, campus: of.campus,
      teacherId: of.teacherId, courseId: of.courseId,
    })
      .then(setStudents)
      .catch(() => { toast.error('Failed to load the students'); setDrill(null); });
  };

  const openDrill = (next: Drill) => {
    if (!data) return;
    setDrill(next);
    setStudents(null);
    loadStudents(next);
  };

  // "Mark paid" on a pending / overdue line: the Fees page's pop-up asks how it was paid
  const markPaid = (s: FeeOverviewStudent) => {
    if (!data || !s.feeId || !s.amount) return;
    setFeeToMark({
      id: s.feeId,
      studentId: s.studentId,
      courseId: s.courseId,
      month: data.month,
      year: data.year,
      amount: s.amount,
      currency: s.currency || 'PKR',
      status: s.feeStatus,
      student: { id: s.studentId, firstName: s.firstName, lastName: s.lastName },
      course: { id: s.courseId, title: s.classTitle },
    } as unknown as Fee);
  };

  // After a fee is marked paid: refresh the open list and the numbers behind it
  const afterPaid = () => {
    if (drill) loadStudents(drill);
    setReload((n) => n + 1);
  };

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

  const tiles: { label: string; status: FeeOverviewStatus; group: FeeGroup | undefined; border: string; text: string }[] = [
    { label: 'Total', status: 'total', group: data?.total, border: 'border-blue-500', text: 'text-gray-900' },
    { label: 'Paid', status: 'paid', group: data?.paid, border: 'border-emerald-500', text: 'text-emerald-700' },
    { label: 'Pending', status: 'pending', group: data?.pending, border: 'border-orange-500', text: 'text-orange-600' },
    { label: 'Overdue', status: 'overdue', group: data?.overdue, border: 'border-red-500', text: 'text-red-600' },
  ];

  const query = search.trim().toLowerCase();
  const teachers = (data?.teachers ?? []).filter((t) =>
    !query || t.name.toLowerCase().includes(query) || t.classes.some((c) => c.title.toLowerCase().includes(query)));
  // Students enrolled whose fee for the month is not owed (on leave, dropped, or none made yet)
  const noFee = (row: { enrolled: number; paid: number; pending: number; overdue: number }) =>
    Math.max(0, row.enrolled - row.paid - row.pending - row.overdue);

  /** A number in the teachers' table: click it for the students behind it (0 is not clickable) */
  const cell = (value: number, color: string, target: Omit<Drill, 'campus'> & { campus?: 'senior' | 'junior' }, padding: string) => (
    <td className={`px-4 text-right ${padding}`}>
      {value > 0 ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openDrill({ ...target, campus: target.campus || (campus === 'both' ? 'senior' : campus) }); }}
          className={`rounded px-1.5 underline decoration-dotted underline-offset-2 hover:bg-indigo-100 ${color}`}
          title="Show these students"
        >
          {value}
        </button>
      ) : (
        <span className="px-1.5 text-gray-300">0</span>
      )}
    </td>
  );

  const period_ = data ? `${MONTHS[data.month - 1]} ${data.year}` : '';
  const formatDue = (date: string | null) => {
    if (!date) return '-';
    const [y, m, d] = date.split('-').map(Number);
    return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
  };

  return (
    <div className={`mb-8 ${loading ? 'opacity-60' : ''}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">
          Fees for {data ? period_ : 'this month'}
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

      {/* 1. The month in four numbers: click a box for its students */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ label, status, group, border, text }) => (
          <button
            key={label}
            type="button"
            disabled={!group?.students}
            onClick={() => openDrill({ title: `${label === 'Total' ? 'All students with fees' : label}`, status, campus })}
            title="Show these students"
            className={`rounded-xl border-l-4 bg-white p-6 text-left shadow-card transition-all hover:shadow-card-hover disabled:cursor-default ${border}`}
          >
            <h3 className="text-sm font-medium text-gray-500">{label}</h3>
            <p className={`mt-2 text-3xl font-bold ${text}`}>
              {group?.students ?? 0} <span className="text-base font-medium text-gray-500">student{group?.students === 1 ? '' : 's'}</span>
            </p>
            <p className="mt-1 text-sm text-gray-600">{group?.fees ?? 0} fee{group?.fees === 1 ? '' : 's'}</p>
            <p className="mt-1 text-xs text-gray-400">{group && money(group) ? money(group) : '-'}</p>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Click a box or any number below to see the students. A student is counted once: Overdue if any of their fees is overdue,
        otherwise Pending if any is still pending, otherwise Paid. Dropped and on-leave fees are not counted.
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
                const of = { teacherId: teacher.teacherId, campus: teacher.campus };
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
                      {cell(teacher.enrolled, 'text-gray-900', { ...of, status: 'enrolled', title: `${teacher.name}: all enrolled students` }, 'py-2')}
                      {cell(teacher.paid, 'text-emerald-700', { ...of, status: 'paid', title: `${teacher.name}: paid` }, 'py-2')}
                      {cell(teacher.pending, 'text-orange-600', { ...of, status: 'pending', title: `${teacher.name}: pending` }, 'py-2')}
                      {cell(teacher.overdue, 'text-red-600', { ...of, status: 'overdue', title: `${teacher.name}: overdue` }, 'py-2')}
                      {cell(noFee(teacher), 'text-gray-500', { ...of, status: 'nofee', title: `${teacher.name}: no fee this month` }, 'py-2')}
                    </tr>
                    {expanded && teacher.classes.map((cls) => {
                      const ofClass = { ...of, courseId: cls.courseId };
                      return (
                        <tr key={cls.courseId} className="bg-gray-50 text-gray-600">
                          <td className="px-4 py-1.5 pl-10">{cls.title}</td>
                          {cell(cls.enrolled, 'text-gray-700', { ...ofClass, status: 'enrolled', title: `${cls.title}: all enrolled students` }, 'py-1.5')}
                          {cell(cls.paid, 'text-emerald-700', { ...ofClass, status: 'paid', title: `${cls.title}: paid` }, 'py-1.5')}
                          {cell(cls.pending, 'text-orange-600', { ...ofClass, status: 'pending', title: `${cls.title}: pending` }, 'py-1.5')}
                          {cell(cls.overdue, 'text-red-600', { ...ofClass, status: 'overdue', title: `${cls.title}: overdue` }, 'py-1.5')}
                          {cell(noFee(cls), 'text-gray-500', { ...ofClass, status: 'nofee', title: `${cls.title}: no fee this month` }, 'py-1.5')}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
          Click a teacher to see each class, or a number to see the students. A teacher's row adds up their classes, so a student in two of their classes is counted twice there.
        </p>
      </div>

      {/* The students behind the number that was clicked */}
      {drill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDrill(null)}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{drill.title}</h3>
                <p className="text-sm text-gray-500">
                  {STATUS_LABEL[drill.status]} · {period_}
                  {students && ` · ${new Set(students.map((s) => `${s.campus}-${s.studentId}`)).size} student(s)`}
                </p>
              </div>
              <button type="button" onClick={() => setDrill(null)} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {!students ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">Loading...</p>
              ) : students.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">No students</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-5 py-2 text-left font-medium">Student</th>
                      <th className="px-3 py-2 text-left font-medium">{terms.course}</th>
                      <th className="px-3 py-2 text-right font-medium">Fee</th>
                      <th className="px-3 py-2 text-left font-medium">Due date</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-5 py-2 text-right font-medium">Paid?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.map((s, index) => {
                      // Another campus's students are managed on that campus's own portal
                      const otherPortal = s.campus === 'junior' && !isJuniorPortal;
                      return (
                        <tr key={`${s.campus}-${s.studentId}-${s.courseId}-${index}`} className="hover:bg-indigo-50/30">
                          <td className="px-5 py-2 font-medium">
                            {otherPortal ? (
                              <span className="text-gray-900" title="Open the Junior portal to manage this student">
                                {s.firstName} {s.lastName} <span className="text-xs font-normal text-amber-700">(Junior portal)</span>
                              </span>
                            ) : (
                              <Link
                                to={`/enrollments?studentId=${s.studentId}&courseId=${s.courseId}`}
                                className="text-indigo-600 hover:text-indigo-800 hover:underline"
                                title="Open this enrollment (to drop the student, change the fee...)"
                              >
                                {s.firstName} {s.lastName}
                              </Link>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{s.classTitle}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-gray-900">
                            {s.amount ? `${SYMBOLS[s.currency || 'PKR'] || s.currency} ${Math.round(parseFloat(s.amount)).toLocaleString()}` : '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDue(s.dueDate)}</td>
                          <td className="px-3 py-2">
                            {s.feeStatus ? (
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FEE_BADGE[s.feeStatus]}`}>
                                {s.feeStatus === 'received' ? 'paid' : s.feeStatus}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">no fee</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-5 py-2 text-right">
                            {/* Pending / overdue fees of this portal's own students can be marked paid here */}
                            {(s.feeStatus === 'pending' || s.feeStatus === 'overdue') && s.feeId && !otherPortal && (
                              <button
                                type="button"
                                onClick={() => markPaid(s)}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                title="The student has paid: record how, and mark this fee as received"
                              >
                                <CheckCircleIcon className="h-4 w-4" />
                                Mark paid
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className="border-t px-5 py-3 text-xs text-gray-500">
              Click a student's name to open their enrollment in that class, where you can drop them or change the fee.
              "Mark paid" records the payment exactly as the Fees page does.
            </p>
          </div>
        </div>
      )}

      {/* Same pop-up as the Fees page: online or cash, and the serial number for cash */}
      {feeToMark && (
        <MarkAsReceivedModal
          isOpen
          isBulk={false}
          fees={[feeToMark]}
          onClose={() => setFeeToMark(null)}
          onSuccess={afterPaid}
        />
      )}
    </div>
  );
}
