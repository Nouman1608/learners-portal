import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { XMarkIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import { salaryAdvancesApi, SalaryAdvance } from '../../api/salaryAdvances.api';
import { teacherAttendanceApi, TeacherMark, TeacherMonthSummary, MarkKind } from '../../api/teacherAttendance.api';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;
const daysText = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

interface Props {
  teacherId: string;
  teacherName: string;
  month: number;
  year: number;
  onCancel: () => void;
  onContinue: () => void; // generate the salary slip
  showAttendance: boolean; // absences / lates apply on the Junior portal only
}

/**
 * Before a salary slip is generated, review and add the teacher's salary advances (both
 * portals) and absences / lates (Junior portal) for that month. Changes are saved straight
 * away; "Generate Salary Slip" then builds the slip with them.
 */
const SalarySlipInputsModal: React.FC<Props> = ({ teacherId, teacherName, month, year, onCancel, onContinue, showAttendance }) => {
  const firstDay = `${year}-${pad(month)}-01`;
  const lastDay = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const defaultDay = todayStr >= firstDay && todayStr <= lastDay ? todayStr : firstDay;

  const [marks, setMarks] = useState<TeacherMark[]>([]);
  const [summary, setSummary] = useState<TeacherMonthSummary | null>(null);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mark, setMark] = useState({ date: defaultDay, kind: 'absent' as MarkKind, note: '' });
  const [advance, setAdvance] = useState({ amount: '', paidOn: todayStr, paymentMethod: 'cash', note: '' });

  const load = useCallback(async () => {
    try {
      const [att, adv] = await Promise.all([
        showAttendance ? teacherAttendanceApi.list(month, year, teacherId) : Promise.resolve({ marks: [], summary: [] }),
        salaryAdvancesApi.list({ teacherId, month, year }),
      ]);
      setMarks(att.marks);
      setSummary(att.summary.find((s) => s.teacherId === teacherId) || null);
      setAdvances(adv);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load advances');
    } finally {
      setLoading(false);
    }
  }, [teacherId, month, year, showAttendance]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      await load();
      return true;
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addMark = async () => {
    if (mark.date < firstDay || mark.date > lastDay) return void toast.error(`Pick a day in ${MONTHS[month - 1]} ${year}`);
    if (isWeekend(mark.date)) return void toast.error('Marks are for Monday to Friday only');
    if (await run(() => teacherAttendanceApi.create({ teacherId, ...mark }), mark.kind === 'absent' ? 'Marked absent' : 'Marked late')) {
      setMark((m) => ({ ...m, note: '' }));
    }
  };

  const addAdvance = async () => {
    const amount = advance.amount.replace(/,/g, '').trim();
    if (!(Number(amount) > 0)) return void toast.error('Enter the advance amount');
    if (await run(() => salaryAdvancesApi.create({ teacherId, amount, paidOn: advance.paidOn, month, year,
      paymentMethod: advance.paymentMethod, note: advance.note }), 'Advance recorded')) {
      setAdvance((a) => ({ ...a, amount: '', note: '' }));
    }
  };

  const input = 'rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500';
  const advanceTotal = advances.reduce((s, a) => s + Number(a.amount), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 p-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Salary slip – {teacherName}</h2>
            <p className="text-sm text-gray-500">{MONTHS[month - 1]} {year}: check {showAttendance ? 'absences, lates and advances' : 'salary advances'} before generating</p>
          </div>
          <button onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              {/* Absences & lates (Junior portal only) */}
              {showAttendance && <section>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold text-gray-900">Absences &amp; lates</h3>
                  <span className={`text-sm font-medium ${summary && summary.days > 0 ? 'text-red-700' : 'text-gray-500'}`}>
                    {summary ? `${summary.absences} absent · ${summary.lates} late → ${summary.days ? `${daysText(summary.days)} deducted` : 'nothing deducted'}` : 'None this month'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">2 lates and 2 absences a month are allowed; then half a day per late and 1 day per absence. A Friday or Monday absence always costs 2 days.</p>
                {marks.length > 0 && (
                  <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 text-sm">
                    {marks.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span>
                          <span className="font-medium">{dayLabel(m.date)}</span>{' '}
                          <span className={`rounded-full px-2 py-0.5 text-xs ${m.kind === 'absent' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{m.kind === 'absent' ? 'Absent' : 'Late'}</span>{' '}
                          <span className={m.days ? 'text-red-700' : 'text-gray-500'}>{m.days ? `${daysText(m.days)} – ${m.reason}` : m.reason}</span>
                          {m.note && <span className="text-gray-500"> · {m.note}</span>}
                        </span>
                        <button disabled={busy} onClick={() => run(() => teacherAttendanceApi.remove(m.id), 'Mark removed')}
                          aria-label="Remove mark" className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-40">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="date" value={mark.date} min={firstDay} max={lastDay} aria-label="Day"
                    onChange={(e) => setMark((m) => ({ ...m, date: e.target.value }))} className={input} />
                  <select value={mark.kind} aria-label="Absent or late" onChange={(e) => setMark((m) => ({ ...m, kind: e.target.value as MarkKind }))} className={input}>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                  </select>
                  <input value={mark.note} maxLength={500} placeholder="Note (optional)" aria-label="Note"
                    onChange={(e) => setMark((m) => ({ ...m, note: e.target.value }))} className={`${input} min-w-0 flex-1`} />
                  <button disabled={busy} onClick={addMark}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-900 disabled:opacity-50">
                    <PlusIcon className="h-4 w-4" /> Add
                  </button>
                </div>
              </section>}

              {/* Salary advances */}
              <section>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold text-gray-900">Salary advances</h3>
                  <span className="text-sm font-medium text-gray-700">{advances.length ? `${pkr(advanceTotal)} this month` : 'None this month'}</span>
                </div>
                <p className="text-xs text-gray-500">Comes off this month's slip; anything above the month's pay comes off next month.</p>
                {advances.length > 0 && (
                  <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 text-sm">
                    {advances.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span>
                          <span className="font-medium">{pkr(Number(a.amount))}</span> paid {dayLabel(a.paidOn)}
                          {a.paymentMethod && <span className="text-gray-500"> ({a.paymentMethod === 'bank_transfer' ? 'bank' : a.paymentMethod})</span>}
                          {a.note && <span className="text-gray-500"> · {a.note}</span>}
                        </span>
                        <button disabled={busy} onClick={() => run(() => salaryAdvancesApi.remove(a.id), 'Advance removed')}
                          aria-label="Remove advance" className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-40">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input inputMode="decimal" value={advance.amount} placeholder="Amount" aria-label="Advance amount"
                    onChange={(e) => setAdvance((a) => ({ ...a, amount: e.target.value }))} className={`${input} w-28`} />
                  <input type="date" value={advance.paidOn} aria-label="Paid on"
                    onChange={(e) => setAdvance((a) => ({ ...a, paidOn: e.target.value }))} className={input} />
                  <select value={advance.paymentMethod} aria-label="Paid by" onChange={(e) => setAdvance((a) => ({ ...a, paymentMethod: e.target.value }))} className={input}>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank</option>
                    <option value="other">Other</option>
                  </select>
                  <input value={advance.note} maxLength={1000} placeholder="Note (optional)" aria-label="Advance note"
                    onChange={(e) => setAdvance((a) => ({ ...a, note: e.target.value }))} className={`${input} min-w-0 flex-1`} />
                  <button disabled={busy} onClick={addAdvance}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-900 disabled:opacity-50">
                    <PlusIcon className="h-4 w-4" /> Add
                  </button>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 p-4">
          <button onClick={onCancel} className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200">Cancel</button>
          <button disabled={loading || busy} onClick={onContinue}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            Generate Salary Slip
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalarySlipInputsModal;
