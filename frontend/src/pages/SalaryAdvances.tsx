import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { PlusIcon, TrashIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { salaryAdvancesApi, SalaryAdvance, SalaryAdvanceInput } from '../api/salaryAdvances.api';
import { usersApi } from '../api/users.api';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];
const methodLabel = (v: string | null) => (v ? METHODS.find((m) => m.value === v)?.label || v : '–');
const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const SalaryAdvances: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'sudo';
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(0); // 0 = whole year
  const [teacherFilter, setTeacherFilter] = useState('');
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const emptyForm = (): SalaryAdvanceInput => ({
    teacherId: teacherFilter, amount: '', paidOn: today(), month: now.getMonth() + 1, year: now.getFullYear(),
    paymentMethod: 'cash', note: '',
  });
  const [form, setForm] = useState<SalaryAdvanceInput>(emptyForm());
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
      setAdvances(await salaryAdvancesApi.list({ year, month: month || undefined, teacherId: teacherFilter || undefined }));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load salary advances');
    } finally {
      setLoading(false);
    }
  }, [year, month, teacherFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(() => advances.reduce((s, a) => s + Number(a.amount), 0), [advances]);

  const openNew = () => {
    setForm(emptyForm());
    setShowForm(true);
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amount = form.amount.replace(/,/g, '').trim();
    if (!form.teacherId) return void toast.error('Choose the teacher');
    if (!amount || !(Number(amount) > 0)) return void toast.error('Enter the amount');
    setSaving(true);
    try {
      await salaryAdvancesApi.create({ ...form, amount });
      toast.success('Advance recorded – it will come off the teacher\'s invoice');
      setShowForm(false);
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to record advance');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: SalaryAdvance) => {
    const ok = await confirmDialog({
      title: 'Delete advance',
      message: `Delete the ${pkr(Number(a.amount))} advance to ${a.teacherName} paid on ${a.paidOn}? It will no longer come off their invoice.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await salaryAdvancesApi.remove(a.id);
      toast.success('Advance deleted');
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete advance');
    }
  };

  const set = (k: keyof SalaryAdvanceInput) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: k === 'month' || k === 'year' ? Number(ev.target.value) : ev.target.value }));

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - 2 + i);
  const input = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isAdmin ? 'Salary Advances' : 'My Salary Advances'}</h1>
          <p className="text-sm text-gray-500">
            {isAdmin
              ? 'Money paid to a teacher before their invoice. It comes off the invoice for the month you choose; anything above that month\'s earnings comes off the next month.'
              : 'Advances you received. Each one comes off your invoice for that month, which shows the balance still to be paid.'}
          </p>
        </div>
        {isAdmin && (
          <button onClick={openNew} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <PlusIcon className="h-5 w-5" /> Record advance
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm" aria-label="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm" aria-label="Invoice month">
          <option value={0}>All months</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        {isAdmin && (
          <select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" aria-label="Teacher">
            <option value="">All teachers</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {advances.length > 0 && <span className="text-sm text-gray-600">Total: <strong>{pkr(total)}</strong></span>}
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : advances.length === 0 ? (
          <EmptyState icon={BanknotesIcon} title="No salary advances" description={isAdmin ? 'Use "Record advance" when a teacher is paid before their invoice.' : ''} />
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Paid on</th>
                {isAdmin && <th className="px-4 py-3">Teacher</th>}
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Comes off invoice</th>
                <th className="px-4 py-3">Paid by</th>
                <th className="px-4 py-3">Note</th>
                {isAdmin && <th className="px-4 py-3">Entered by</th>}
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {advances.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3">{a.paidOn}</td>
                  {isAdmin && <td className="px-4 py-3">{a.teacherName}</td>}
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{pkr(Number(a.amount))}</td>
                  <td className="whitespace-nowrap px-4 py-3">{MONTHS[a.month - 1]} {a.year}</td>
                  <td className="px-4 py-3">{methodLabel(a.paymentMethod)}</td>
                  <td className="px-4 py-3 text-gray-600">{a.note || '–'}</td>
                  {isAdmin && <td className="px-4 py-3 text-gray-600">{a.createdByName || '–'}</td>}
                  {isAdmin && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => remove(a)} className="p-1 text-gray-500 hover:text-red-600" title="Delete" aria-label="Delete advance">
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
          <form onSubmit={save} className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Record salary advance</h2>
            <div className="grid grid-cols-2 gap-4">
              <label className="col-span-2 text-sm">
                <span className="mb-1 block font-medium text-gray-700">Teacher *</span>
                <select required value={form.teacherId} onChange={set('teacherId')} className={input}>
                  <option value="">Choose a teacher</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Amount (PKR) *</span>
                <input inputMode="decimal" required value={form.amount} onChange={set('amount')} placeholder="e.g. 15000" className={input} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Paid on *</span>
                <input type="date" required value={form.paidOn} onChange={set('paidOn')} className={input} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Take off invoice for *</span>
                <select value={form.month} onChange={set('month')} className={input}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Year</span>
                <select value={form.year} onChange={set('year')} className={input}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label className="col-span-2 text-sm">
                <span className="mb-1 block font-medium text-gray-700">Paid by</span>
                <select value={form.paymentMethod} onChange={set('paymentMethod')} className={input}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label className="col-span-2 text-sm">
                <span className="mb-1 block font-medium text-gray-700">Note</span>
                <textarea value={form.note} onChange={set('note')} rows={2} maxLength={1000} placeholder="e.g. requested for rent" className={input} />
              </label>
            </div>
            <p className="text-xs text-gray-500">The teacher will see this advance and its deduction on their invoice.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Record advance'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

export default SalaryAdvances;
