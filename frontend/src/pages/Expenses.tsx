import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, TrashIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { expensesApi, Expense, ExpenseInput, ExpenseCampus, MonthSummary, EXPENSE_CATEGORIES } from '../api/expenses.api';
import { brand } from '../brand';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];
const categoryLabel = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label || v;
const methodLabel = (v: string | null) => (v ? METHODS.find((m) => m.value === v)?.label || v : '–');
const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const emptyForm = (): ExpenseInput => ({
  expenseDate: today(), category: 'rent', description: '', paidTo: '', amount: '', currency: 'PKR', paymentMethod: 'cash', notes: '',
});

const Expenses: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 0 = whole year
  const [category, setCategory] = useState('');
  const [campus, setCampus] = useState<ExpenseCampus>('senior');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();

  // Sudo on the Senior portal can also read the Junior Campus; entries are added on each campus's own portal.
  const canSwitchCampus = brand.campus === 'senior';
  const readOnly = campus !== 'senior';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = month ? `${year}-${pad(month)}-01` : `${year}-01-01`;
      const end = month ? `${year}-${pad(month)}-${lastDay(year, month)}` : `${year}-12-31`;
      const [list, months] = await Promise.all([
        expensesApi.list(start, end, campus, category || undefined),
        expensesApi.summary(year, campus),
      ]);
      setExpenses(list);
      setSummary(months);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [year, month, category, campus]);

  useEffect(() => {
    load();
  }, [load]);

  const period = useMemo(() => {
    const rows = month ? summary.filter((m) => m.month === month) : summary;
    const total = { incomePKR: 0, teacherPayPKR: 0, expensesPKR: 0, netPKR: 0, byCategory: {} as Record<string, number> };
    for (const m of rows) {
      total.incomePKR += m.incomePKR;
      total.teacherPayPKR += m.teacherPayPKR;
      total.expensesPKR += m.expensesPKR;
      total.netPKR += m.netPKR;
      for (const [k, v] of Object.entries(m.byCategory)) total.byCategory[k] = (total.byCategory[k] || 0) + v;
    }
    return total;
  }, [summary, month]);

  const openNew = () => {
    setEditing(null);
    const f = emptyForm();
    if (month && !(year === now.getFullYear() && month === now.getMonth() + 1)) f.expenseDate = `${year}-${pad(month)}-01`;
    setForm(f);
    setShowForm(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      expenseDate: e.expenseDate, category: e.category, description: e.description || '', paidTo: e.paidTo || '',
      amount: String(Number(e.amount)), currency: e.currency, paymentMethod: e.paymentMethod || '', notes: e.notes || '',
    });
    setShowForm(true);
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amount = form.amount.replace(/,/g, '').trim();
    if (!amount || !(Number(amount) > 0)) {
      toast.error('Enter the amount');
      return;
    }
    setSaving(true);
    try {
      const data = { ...form, amount };
      if (editing) {
        await expensesApi.update(editing.id, data);
        toast.success('Expense updated');
      } else {
        await expensesApi.create(data);
        toast.success('Expense added');
      }
      setShowForm(false);
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: Expense) => {
    const ok = await confirmDialog({
      title: 'Delete expense',
      message: `Delete ${categoryLabel(e.category)} – ${e.currency} ${Number(e.amount).toLocaleString()} on ${e.expenseDate}?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await expensesApi.remove(e.id);
      toast.success('Expense deleted');
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete expense');
    }
  };

  const set = (k: keyof ExpenseInput) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: ev.target.value }));

  const periodLabel = month ? `${MONTHS[month - 1]} ${year}` : `${year}`;
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i);
  const input = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500">Rent, utilities, salaries and other costs – against the fees received. Only you (sudo) can see this.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSwitchCampus && (
            <div className="inline-flex rounded-lg bg-white shadow p-1" role="group" aria-label="Campus">
              {([['senior', 'Senior Campus'], ['junior', 'Junior Campus'], ['both', 'Both']] as [ExpenseCampus, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCampus(value)}
                  aria-pressed={campus === value}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition ${campus === value ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {!readOnly && (
            <button onClick={openNew} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              <PlusIcon className="h-5 w-5" /> Add expense
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <p className="rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-800">
          Showing {campus === 'junior' ? 'the Junior Campus' : 'both campuses'} (read only). Add Junior Campus expenses on the Junior portal.
        </p>
      )}

      {/* Period filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value={0}>Whole year</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Totals for the period (PKR) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Fees received', period.incomePKR, 'text-green-700'],
          ['Teacher pay (teacher invoices)', period.teacherPayPKR, 'text-orange-700'],
          ['Expenses', period.expensesPKR, 'text-red-700'],
          ['Net', period.netPKR, period.netPKR >= 0 ? 'text-green-700' : 'text-red-700'],
        ].map(([label, value, colour]) => (
          <div key={label as string} className="rounded-lg bg-white p-4 shadow">
            <p className="text-xs font-medium uppercase text-gray-500">{label} · {periodLabel}</p>
            <p className={`mt-1 text-xl font-semibold ${colour}`}>{pkr(value as number)}</p>
          </div>
        ))}
      </div>

      {Object.keys(period.byCategory).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(period.byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <span key={k} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">{categoryLabel(k)}: {pkr(v)}</span>
          ))}
        </div>
      )}

      {/* Expenses list */}
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : expenses.length === 0 ? (
          <EmptyState icon={BanknotesIcon} title={`No expenses for ${periodLabel}`} description={readOnly ? '' : 'Add rent, utilities, salaries and other costs with "Add expense".'} />
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                {campus === 'both' && <th className="px-4 py-3">Campus</th>}
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Paid to</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Paid by</th>
                {!readOnly && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <tr key={`${e.campus}-${e.id}`} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3">{e.expenseDate}</td>
                  {campus === 'both' && <td className="px-4 py-3 capitalize">{e.campus}</td>}
                  <td className="px-4 py-3">{categoryLabel(e.category)}</td>
                  <td className="px-4 py-3">
                    {e.description || '–'}
                    {e.notes && <p className="text-xs text-gray-500">{e.notes}</p>}
                  </td>
                  <td className="px-4 py-3">{e.paidTo || '–'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{e.currency} {Number(e.amount).toLocaleString()}</td>
                  <td className="px-4 py-3">{methodLabel(e.paymentMethod)}</td>
                  {!readOnly && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => openEdit(e)} className="p-1 text-gray-500 hover:text-indigo-600" title="Edit"><PencilIcon className="h-4 w-4" /></button>
                      <button onClick={() => remove(e)} className="p-1 text-gray-500 hover:text-red-600" title="Delete"><TrashIcon className="h-4 w-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Month by month for the year */}
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <h2 className="px-4 pt-4 text-base font-semibold text-gray-900">{year} month by month (PKR)</h2>
        <table className="mt-2 min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Month</th>
              <th className="px-4 py-2 text-right">Fees received</th>
              <th className="px-4 py-2 text-right">Teacher pay</th>
              <th className="px-4 py-2 text-right">Expenses</th>
              <th className="px-4 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.map((m) => (
              <tr key={m.month} className={m.month === month ? 'bg-indigo-50' : ''}>
                <td className="px-4 py-2">{MONTHS[m.month - 1]}</td>
                <td className="px-4 py-2 text-right">{pkr(m.incomePKR)}</td>
                <td className="px-4 py-2 text-right">{pkr(m.teacherPayPKR)}</td>
                <td className="px-4 py-2 text-right">{pkr(m.expensesPKR)}</td>
                <td className={`px-4 py-2 text-right font-medium ${m.netPKR >= 0 ? 'text-green-700' : 'text-red-700'}`}>{pkr(m.netPKR)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-gray-500">
          Fees received = payments recorded that month. Teacher pay = the month's teacher invoices – so under Salaries, enter only pay that is not on a teacher invoice (admin and other staff).
          Other currencies are converted to PKR at the portal's rates.
        </p>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={save} className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit expense' : 'Add expense'}</h2>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Date *</span>
                <input type="date" required value={form.expenseDate} onChange={set('expenseDate')} className={input} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Category *</span>
                <select value={form.category} onChange={set('category')} className={input}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Amount *</span>
                <input inputMode="decimal" required value={form.amount} onChange={set('amount')} placeholder="e.g. 85000" className={input} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Currency</span>
                <select value={form.currency} onChange={set('currency')} className={input}>
                  {['PKR', 'USD', 'GBP', 'SAR'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="col-span-2 text-sm">
                <span className="mb-1 block font-medium text-gray-700">Description</span>
                <input value={form.description} onChange={set('description')} maxLength={255} placeholder="e.g. October rent, electricity bill" className={input} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Paid to</span>
                <input value={form.paidTo} onChange={set('paidTo')} maxLength={150} placeholder="e.g. landlord, LESCO" className={input} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">Paid by</span>
                <select value={form.paymentMethod} onChange={set('paymentMethod')} className={input}>
                  <option value="">–</option>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label className="col-span-2 text-sm">
                <span className="mb-1 block font-medium text-gray-700">Notes</span>
                <textarea value={form.notes} onChange={set('notes')} rows={2} maxLength={2000} className={input} />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Save' : 'Add expense'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

export default Expenses;
