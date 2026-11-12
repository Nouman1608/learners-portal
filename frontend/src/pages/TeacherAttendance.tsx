import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { teacherAttendanceApi, TeacherMonthRow, MonthCounts, deductionDays } from '../api/teacherAttendance.api';
import { useAuth } from '../context/AuthContext';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const daysText = (n: number) => (n === 0 ? 'nothing' : `${n} day${n === 1 ? '' : 's'}`);
const FIELDS: [keyof MonthCounts, string][] = [
  ['absences', 'Absences (Tue–Thu)'],
  ['friMonAbsences', 'Absences on Fri / Mon'],
  ['lates', 'Lates'],
];

/** Junior portal: each teacher's absences and lates for a month, entered as totals */
const TeacherAttendance: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'sudo';
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<TeacherMonthRow[]>([]);
  const [draft, setDraft] = useState<Record<string, MonthCounts>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await teacherAttendanceApi.list(month, year);
      setRows(list);
      setDraft(Object.fromEntries(list.map((r) => [r.teacherId, { absences: r.absences, friMonAbsences: r.friMonAbsences, lates: r.lates }])));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load absences and lates');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = (r: TeacherMonthRow) => {
    const d = draft[r.teacherId];
    return d && (d.absences !== r.absences || d.friMonAbsences !== r.friMonAbsences || d.lates !== r.lates);
  };

  const save = async (r: TeacherMonthRow) => {
    setSavingId(r.teacherId);
    try {
      await teacherAttendanceApi.save({ teacherId: r.teacherId, month, year, ...draft[r.teacherId] });
      toast.success(`Saved for ${r.teacherName}`);
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  const setField = (id: string, field: keyof MonthCounts, value: string) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [field]: Math.max(0, Math.min(31, parseInt(value, 10) || 0)) } }));

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{isAdmin ? 'Absences & Lates' : 'My Absences & Lates'}</h2>
        <p className="text-sm text-gray-500">
          Enter each teacher's totals for the month. 2 absences (Tue–Thu) and 2 lates are allowed; after that each absence costs
          1 day's pay and each late half a day. Every absence on a Friday or Monday costs 2 days. Day's pay = the month's earnings ÷ Monday–Friday days.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm" aria-label="Month">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm" aria-label="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Teacher</th>
                {FIELDS.map(([, label]) => <th key={label} className="px-4 py-3 text-center">{label}</th>)}
                <th className="px-4 py-3">Deduction</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const d = draft[r.teacherId] || r;
                const days = deductionDays(d);
                return (
                  <tr key={r.teacherId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{r.teacherName}</td>
                    {FIELDS.map(([field, label]) => (
                      <td key={field} className="px-4 py-2 text-center">
                        {isAdmin ? (
                          <input type="number" min={0} max={31} value={d[field]} aria-label={`${label} for ${r.teacherName}`}
                            onChange={(e) => setField(r.teacherId, field, e.target.value)}
                            className="w-16 rounded-md border border-gray-300 px-2 py-1 text-center" />
                        ) : d[field]}
                      </td>
                    ))}
                    <td className={`px-4 py-2 ${days ? 'font-medium text-red-700' : 'text-gray-500'}`}>{daysText(days)}</td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-right">
                        <button disabled={!changed(r) || savingId === r.teacherId} onClick={() => save(r)}
                          className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-30">
                          {savingId === r.teacherId ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TeacherAttendance;
