import { useState } from 'react';
import { Link } from 'react-router-dom';
import { XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import MarkAsReceivedModal from './MarkAsReceivedModal';
import { Fee, feesApi } from '../../api/enrollments.api';
import ConfirmDialog from '../common/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import toast from 'react-hot-toast';
import { terms, isJuniorPortal } from '../../brand';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SYMBOLS: Record<string, string> = { PKR: 'PKR', USD: '$', GBP: '£', SAR: 'SR' };
const FEE_BADGE: Record<string, string> = {
  received: 'bg-emerald-100 text-emerald-800', pending: 'bg-orange-100 text-orange-800', overdue: 'bg-red-100 text-red-800',
};

/** One student in one class, with that fee (if any) */
export interface FeeListRow {
  studentId: string;
  firstName: string;
  lastName: string;
  courseId: string;
  classTitle: string;
  feeId: string | null;
  amount: string | null; // null = no fee owed
  currency: string | null;
  feeStatus: 'received' | 'pending' | 'overdue' | null;
  dueDate: string | null; // YYYY-MM-DD
  /** The month the fee is for; left out when the whole list is one month (see `period`) */
  month?: number;
  year?: number;
  campus?: 'senior' | 'junior';
}

interface FeeListModalProps {
  title: string;
  /** Second line under the title, e.g. "Pending · November 2026" */
  subtitle: string;
  /** null while loading */
  rows: FeeListRow[] | null;
  /** The month of the list, for rows that do not carry their own */
  period?: { month: number; year: number };
  onClose: () => void;
  /** A fee was marked paid: reload the list and the numbers behind it */
  onPaid: () => void;
}

const formatDue = (date: string | null) => {
  if (!date) return '-';
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
};

/**
 * The list of students behind a number (dashboard fee overview, Teacher profitability):
 * student, class, fee, due date and status, a total per currency at the bottom, and
 * "Mark paid" on unpaid fees. A student's name opens their enrollment in that class.
 */
export default function FeeListModal({ title, subtitle, rows, period, onClose, onPaid }: FeeListModalProps) {
  // The fee being marked as paid (same pop-up as the Fees page)
  const [feeToMark, setFeeToMark] = useState<Fee | null>(null);
  const { confirm, dialogProps } = useConfirmDialog();
  const [busyFeeId, setBusyFeeId] = useState<string | null>(null);

  // "Dropped" / "On leave": the same actions, wording and confirmation as the ticks on the Fees
  // page. Either way the fee is no longer owed, so it leaves this list.
  const markNotOwed = async (row: FeeListRow, kind: 'dropped' | 'leave') => {
    const { month, year } = monthOf(row);
    if (!row.feeId || !month || !year) return;
    const name = `${row.firstName} ${row.lastName}`;
    const periodName = `${MONTHS[month - 1]} ${year}`;
    const confirmed = await confirm(kind === 'dropped' ? {
      title: 'Mark as dropped – not paying',
      message: `${name} has dropped ${row.classTitle}?\n\nThe ${periodName} fee will no longer be owed and is taken off the student and teacher invoices. The enrollment is marked as dropped, and unpaid fees for later months are removed.\n\nTo undo this, use the Fees page.`,
      confirmLabel: 'Mark dropped',
      variant: 'warning',
    } : {
      title: 'Mark as on leave',
      message: `${name} is on leave for ${periodName}?\n\nThe ${row.classTitle} fee for ${periodName} will not be owed and is taken off the student and teacher invoices. ${name} stays enrolled, so next month is billed as normal.\n\nTo undo this, use the Fees page.`,
      confirmLabel: 'On leave',
      variant: 'info',
    });
    if (!confirmed) return;
    setBusyFeeId(row.feeId);
    try {
      if (kind === 'dropped') await feesApi.setFeeDropped(row.feeId, true);
      else await feesApi.setFeeOnLeave(row.feeId, true);
      toast.success(kind === 'dropped' ? 'Marked as dropped – not paying' : 'Marked as on leave');
      onPaid();
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to update fee');
    } finally {
      setBusyFeeId(null);
    }
  };

  const monthOf = (row: FeeListRow) => ({ month: row.month ?? period?.month, year: row.year ?? period?.year });
  // A Month column only when the list covers more than one month
  const showMonth = new Set((rows ?? []).filter((r) => r.month).map((r) => `${r.year}-${r.month}`)).size > 1;

  const markPaid = (row: FeeListRow) => {
    const { month, year } = monthOf(row);
    if (!row.feeId || !row.amount || !month || !year) return;
    setFeeToMark({
      id: row.feeId,
      studentId: row.studentId,
      courseId: row.courseId,
      month,
      year,
      amount: row.amount,
      currency: row.currency || 'PKR',
      status: row.feeStatus,
      student: { id: row.studentId, firstName: row.firstName, lastName: row.lastName },
      course: { id: row.courseId, title: row.classTitle },
    } as unknown as Fee);
  };

  // Total of the fees listed, one line per currency (never added across currencies)
  const perCurrency = new Map<string, number>();
  let feeCount = 0;
  for (const row of rows ?? []) {
    if (!row.amount) continue;
    feeCount++;
    const currency = row.currency || 'PKR';
    perCurrency.set(currency, (perCurrency.get(currency) || 0) + parseFloat(row.amount));
  }
  const totals = [...perCurrency]
    .sort(([a], [b]) => (a === 'PKR' ? -1 : b === 'PKR' ? 1 : a.localeCompare(b)))
    .map(([currency, amount]) => `${SYMBOLS[currency] || currency} ${Math.round(amount).toLocaleString()}`);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500">
                {subtitle}
                {rows && ` · ${new Set(rows.map((r) => `${r.campus}-${r.studentId}`)).size} student(s)`}
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
              <p className="px-5 py-8 text-center text-sm text-gray-400">No students</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-5 py-2 text-left font-medium">Student</th>
                    <th className="px-3 py-2 text-left font-medium">{terms.course}</th>
                    {showMonth && <th className="px-3 py-2 text-left font-medium">Month</th>}
                    <th className="px-3 py-2 text-right font-medium">Fee</th>
                    <th className="px-3 py-2 text-left font-medium">Due date</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-5 py-2 text-right font-medium">Paid / not owed?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, index) => {
                    // Another campus's students are managed on that campus's own portal
                    const otherPortal = row.campus === 'junior' && !isJuniorPortal;
                    const { month, year } = monthOf(row);
                    return (
                      <tr key={`${row.campus}-${row.studentId}-${row.courseId}-${row.feeId}-${index}`} className="hover:bg-indigo-50/30">
                        <td className="px-5 py-2 font-medium">
                          {otherPortal ? (
                            <span className="text-gray-900" title="Open the Junior portal to manage this student">
                              {row.firstName} {row.lastName} <span className="text-xs font-normal text-amber-700">(Junior portal)</span>
                            </span>
                          ) : (
                            <Link
                              to={`/enrollments?studentId=${row.studentId}&courseId=${row.courseId}`}
                              className="text-indigo-600 hover:text-indigo-800 hover:underline"
                              title="Open this enrollment (to drop the student, change the fee...)"
                            >
                              {row.firstName} {row.lastName}
                            </Link>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{row.classTitle}</td>
                        {showMonth && <td className="whitespace-nowrap px-3 py-2 text-gray-600">{month && year ? `${MONTHS[month - 1].slice(0, 3)} ${year}` : '-'}</td>}
                        <td className="whitespace-nowrap px-3 py-2 text-right text-gray-900">
                          {row.amount ? `${SYMBOLS[row.currency || 'PKR'] || row.currency} ${Math.round(parseFloat(row.amount)).toLocaleString()}` : '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDue(row.dueDate)}</td>
                        <td className="px-3 py-2">
                          {row.feeStatus ? (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FEE_BADGE[row.feeStatus]}`}>
                              {row.feeStatus === 'received' ? 'paid' : row.feeStatus}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">no fee</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-2 text-right">
                          {/* Pending / overdue fees of this portal's own students can be marked paid here */}
                          {(row.feeStatus === 'pending' || row.feeStatus === 'overdue') && row.feeId && !otherPortal && (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => markPaid(row)}
                                disabled={busyFeeId === row.feeId}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                title="The student has paid: record how, and mark this fee as received"
                              >
                                <CheckCircleIcon className="h-4 w-4" />
                                Mark paid
                              </button>
                              {/* On leave is a Junior portal feature, as on the Fees page */}
                              {isJuniorPortal && (
                                <button
                                  type="button"
                                  onClick={() => markNotOwed(row, 'leave')}
                                  disabled={busyFeeId === row.feeId}
                                  className="rounded-md bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                                  title="On leave this month: this fee is not owed, the student stays enrolled"
                                >
                                  Leave
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => markNotOwed(row, 'dropped')}
                                disabled={busyFeeId === row.feeId}
                                className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                                title="Dropped – not paying: this fee is not owed and the enrollment is dropped"
                              >
                                Dropped
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {feeCount > 0 && (
                  <tfoot className="sticky bottom-0 bg-gray-100 text-sm font-semibold text-gray-900">
                    <tr>
                      <td className="px-5 py-3" colSpan={showMonth ? 3 : 2}>
                        Total <span className="font-normal text-gray-500">({feeCount} fee{feeCount === 1 ? '' : 's'})</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        {totals.map((line) => <div key={line}>{line}</div>)}
                      </td>
                      <td className="px-3 py-3" colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
          <p className="border-t px-5 py-3 text-xs text-gray-500">
            Click a student's name to open their enrollment in that class, where you can drop them or change the fee.
            "Mark paid" records the payment exactly as the Fees page does. "Dropped"{isJuniorPortal ? ' and "Leave"' : ''} take the fee off
            what is owed, as the ticks on the Fees page do (undo them there).
          </p>
        </div>
      </div>

      {/* Same pop-up as the Fees page: online or cash, and the serial number for cash */}
      {feeToMark && (
        <MarkAsReceivedModal
          isOpen
          isBulk={false}
          fees={[feeToMark]}
          onClose={() => setFeeToMark(null)}
          onSuccess={onPaid}
        />
      )}
      <ConfirmDialog {...dialogProps} />
    </>
  );
}
