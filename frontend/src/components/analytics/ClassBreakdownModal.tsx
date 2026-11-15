import { Link } from 'react-router-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { StudentFinance } from '../../api/analytics.api';
import { isJuniorPortal } from '../../brand';

const pkr = (amount: number) => `PKR ${Math.round(amount).toLocaleString()}`;

/** The figures of the class row, in the table's order */
export type BreakdownColumn = 'revenue' | 'invoiced' | 'notInvoiced' | 'paid' | 'notReceived' | 'cost' | 'profit' | 'soFar';

const COLUMNS: { key: BreakdownColumn; header: string; value: (s: StudentFinance) => number; tone?: 'profit' }[] = [
  { key: 'revenue', header: 'Revenue', value: (s) => s.revenuePKR },
  { key: 'invoiced', header: 'Invoiced', value: (s) => s.invoicedPKR },
  { key: 'notInvoiced', header: 'Not invoiced', value: (s) => s.notInvoicedPKR },
  { key: 'paid', header: 'Received', value: (s) => s.paidPKR },
  { key: 'notReceived', header: 'Not received', value: (s) => s.notReceivedPKR },
  { key: 'cost', header: 'Teacher cost', value: (s) => s.teacherPayPKR },
  { key: 'profit', header: 'Expected profit', value: (s) => s.expectedProfitPKR, tone: 'profit' },
  { key: 'soFar', header: 'Profit so far', value: (s) => s.profitSoFarPKR, tone: 'profit' },
];

interface ClassBreakdownModalProps {
  title: string; // the class
  subtitle: string; // the period
  courseId: string;
  /** The figure that was clicked: its column is highlighted */
  highlight?: BreakdownColumn;
  /** null while loading */
  rows: StudentFinance[] | null;
  onClose: () => void;
}

/**
 * One class of Course profitability, student by student: the same columns as the class's
 * row, and they add up to it. A student's name opens their enrollment in the class.
 */
export default function ClassBreakdownModal({ title, subtitle, courseId, highlight, rows, onClose }: ClassBreakdownModalProps) {
  const anyShared = (rows ?? []).some((s) => s.sharedPayPKR > 0.5);
  const anyEstimate = (rows ?? []).some((s) => s.estimatedPayPKR > 0.5);
  const lit = (key: BreakdownColumn) => (key === highlight ? 'bg-indigo-50' : '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">
              Student by student · {subtitle}{rows && ` · ${rows.filter((s) => s.studentId).length} student(s)`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {!rows ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No students with fees in this period</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-2 text-left font-medium">Student</th>
                  {COLUMNS.map((column) => (
                    <th key={column.key} className={`px-3 py-2 text-right font-medium ${column.key === highlight ? 'bg-indigo-100 text-indigo-800' : ''}`}>{column.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((s, index) => {
                  // Another campus's students are managed on that campus's own portal
                  const otherPortal = s.campus === 'junior' && !isJuniorPortal;
                  return (
                    <tr key={`${s.studentId}-${index}`} className="hover:bg-indigo-50/30">
                      <td className="px-5 py-2 font-medium">
                        {!s.studentId ? (
                          <span className="italic text-gray-500">{s.firstName}</span>
                        ) : otherPortal ? (
                          <span className="text-gray-900">{s.firstName} {s.lastName} <span className="text-xs font-normal text-amber-700">(Junior portal)</span></span>
                        ) : (
                          <Link
                            to={`/enrollments?studentId=${s.studentId}&courseId=${courseId}`}
                            className="text-indigo-600 hover:text-indigo-800 hover:underline"
                            title="Open this enrollment (to drop the student, change the fee...)"
                          >
                            {s.firstName} {s.lastName}
                          </Link>
                        )}
                      </td>
                      {COLUMNS.map((column) => {
                        const value = column.value(s);
                        const color = column.tone === 'profit' ? (value >= 0 ? 'text-green-700' : 'text-red-600')
                          : column.key === 'notReceived' && value > 0 ? 'text-red-600'
                          : column.key === 'paid' ? 'text-green-700' : 'text-gray-900';
                        return (
                          <td key={column.key} className={`whitespace-nowrap px-3 py-2 text-right ${color} ${lit(column.key)}`}>
                            {pkr(value)}
                            {column.key === 'cost' && s.estimatedPayPKR > 0.5 && <div className="text-xs text-amber-600">{pkr(s.estimatedPayPKR)} estimate</div>}
                            {column.key === 'cost' && s.sharedPayPKR > 0.5 && <div className="text-xs text-gray-400">{pkr(s.sharedPayPKR)} shared</div>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-gray-100 text-sm font-semibold text-gray-900">
                <tr>
                  <td className="px-5 py-3">Total ({rows.filter((s) => s.studentId).length})</td>
                  {COLUMNS.map((column) => (
                    <td key={column.key} className={`whitespace-nowrap px-3 py-3 text-right ${column.key === highlight ? 'bg-indigo-100' : ''}`}>
                      {pkr(rows.reduce((sum, s) => sum + column.value(s), 0))}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <p className="border-t px-5 py-3 text-xs text-gray-500">
          The students add up to the class's row. Click a student's name to open their enrollment in this class.
          {anyShared && ' "Shared" is teacher pay that is not paid per student (a fixed salary\'s share for this class, or 1-to-1 classes not counted yet), split equally between the students.'}
          {anyEstimate && ' "Estimate" means there is no salary slip yet for that part.'}
        </p>
      </div>
    </div>
  );
}
