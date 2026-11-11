import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PlusIcon, TrashIcon, ClockIcon } from '@heroicons/react/24/outline';
import { teacherAttendanceApi, TeacherMark, TeacherMonthSummary, MarkKind } from '../api/teacherAttendance.api';
import { usersApi } from '../api/users.api';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
const daysText = (n: number) => (n === 0 ? 'nothing' : `${n} day${n === 1 ? '' : 's'}`);

const TeacherAttendance: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'sudo';
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [teacherFilter, setTeacherFilter] = useState('');
  const [marks, setMarks] = useState<TeacherMark[]>([]);
  const [summary, setSummary] = useState<TeacherMonthSummary[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ teacherId: '', date: today(), kind: 'absent' as MarkKind, note: '' });
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();

  useEffect(() => {
    if (!isAdmin) return;
    usersApi.getUsersByRole('teacher')
      .then((list) => setTeachers(list
        .map((t) => ({ id: t.id, name: `${t.firstName} ${t.lastName}`.trim() }))
        .sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => toast.error('Failed to load teachers'));
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await teacherAttendanceApi.list(month, year, teacherFilter || undefined);
      setMarks(data.marks);
      setSummary(data.summary);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load attendance marks');
    } finally {
      setLoading(false);
    }
  }, [month, year, teacherFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm({ teacherId: teacherFilter, date: today(), kind: 'absent', note: '' });
    setShowForm(true);
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.teacherId) return void toast.error('Choose the teacher');
    if (isWeekend(form.date)) return void toast.error('Marks are for Monday to Friday only');
    setSaving(true);
    try {
      await teacherAttendanceApi.create(form);
      toast.success(form.kind === 'absent' ? 'Marked absent' : 'Marked late');
      setShowForm(false);
      const [y, m] = form.date.split('-').map(Number);
      if (y !== year || m !== month) {
        setYear(y);
        setMonth(m);
      } else {
        load();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: TeacherMark) => {
    const ok = await confirmDialog({
      title: 'Delete mark',
      message: `Remove "${m.kind}" for ${m.teacherName} on ${dayLabel(m.date)}? Their deduction for the month is worked out again.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await teacherAttendanceApi.remove(m.id);
      toast.success('Mark deleted');
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete');
    }
  };

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - 2 + i);
  const input = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isAdmin ? 'Teacher Absences & Lates' : 'My Absences & Lates'}</h1>
          <p className="text-sm text-gray-500">
            2 lates and 2 absences a month are allowed. After that each late costs half a day's pay and each absence 1 day.
            An absence on a Friday or Monday always costs 2 days. Day's pay = the month's earnings ÷ Monday–Friday days.
          </p>
        </div>
        {isAdmin && (
          <button onClick={openNew} className="inline-flex shrink-0 items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <PlusIcon className="h-5 w-5" /> Mark absent / late
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm" aria-label="Month">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm" aria-label="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {isAdmin && (
          <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" aria-label="Teacher">
            <option value="">All teachers</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {summary.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map((s) => (
            <div key={s.teacherId} className="rounded-lg bg-white p-4 shadow">
              <p className="font-medium text-gray-900">{s.teacherName}</p>
              <p className="mt-1 text-sm text-gray-600">{s.absences} absent · {s.lates} late</p>
              <p className={`mt-1 text-sm font-semibold ${s.days > 0 ? 'text-red-700' : 'text-green-700'}`}>
                Deduction: {daysText(s.days)}{s.days > 0 ? ' of pay' : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : marks.length === 0 ? (
          <EmptyState icon={ClockIcon} title={`No absences or lates in ${MONTHS[month - 1]} ${year}`} description={isAdmin ? 'Use "Mark absent / late" when a teacher is absent or comes late.' : ''} />
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Day</th>
                {isAdmin && <th className="px-4 py-3">Teacher</th>}
                <th className="px-4 py-3">Mark</th>
                <th className="px-4 py-3">Counts as</th>
                <th className="px-4 py-3">Note</th>
                {isAdmin && <th className="px-4 py-3">Entered by</th>}
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {marks.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3">{dayLabel(m.date)}</td>
                  {isAdmin && <td className="px-4 py-3">{m.teacherName}</td>}
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${m.kind === 'absent' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                      {m.kind === 'absent' ? 'Absent' : 'Late'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={m.days ? 'font-medium text-red-700' : 'text-gray-500'}>
                      {m.days ? `${daysText(m.days)} – ${m.reason}` : m.reason}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.note || '–'}</td>
                  {isAdmin && <td className="px-4 py-3 text-gray-600">{m.createdByName || '–'}</td>}
                  {isAdmin && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => remove(m)} className="p-1 text-gray-500 hover:text-red-600" title="Delete" aria-label="Delete mark">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={save} className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Mark absent / late</h2>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Teacher *</span>
              <select required value={form.teacherId} onChange={(e) => setForm((f) => ({ ...f, teacherId: e.target.value }))} className={input}>
                <option value="">Choose a teacher</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Day *</span>
              <input type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={input} />
              {form.date && <span className="mt-1 block text-xs text-gray-500">{dayLabel(form.date)}{isWeekend(form.date) ? ' – weekend, not allowed' : ''}</span>}
            </label>
            <fieldset className="text-sm">
              <legend className="mb-1 font-medium text-gray-700">Mark *</legend>
              <div className="flex gap-4">
                {(['absent', 'late'] as MarkKind[]).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="radio" name="kind" value={k} checked={form.kind === k} onChange={() => setForm((f) => ({ ...f, kind: k }))} />
                    {k === 'absent' ? 'Absent' : 'Late'}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Note</span>
              <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} maxLength={500} placeholder="e.g. arrived 9:40" className={input} />
            </label>
            <p className="text-xs text-gray-500">The teacher sees this mark and the deduction on their invoice.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

export default TeacherAttendance;
