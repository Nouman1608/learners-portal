import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { leadsApi, Lead } from '../../api/leads.api';
import { isJuniorPortal, JUNIOR_CATEGORIES } from '../../brand';

interface Props {
  lead: Lead;
  onClose: () => void;
  onCreated: (lead: Lead) => void;
}

// "SALAH 1-1" -> first "Salah"; the " 1-1" marker and extra spaces are dropped
const splitName = (name: string) => {
  const clean = name.split('/')[0].replace(/\b1-1\b/gi, '').replace(/\s+/g, ' ').trim()
    .toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const [first, ...rest] = clean.split(' ');
  return { first: first || '', last: rest.join(' ') };
};
const makeUsername = (first: string, last: string) =>
  [first, last].filter(Boolean).join('.').toLowerCase().replace(/[^a-z0-9.]/g, '');

/** Leads page: a lead whose demo went well and who is joining gets a student account */
const CreateStudentFromLeadModal: React.FC<Props> = ({ lead, onClose, onCreated }) => {
  const initial = splitName(lead.name);
  const [form, setForm] = useState({
    firstName: initial.first,
    lastName: initial.last,
    username: makeUsername(initial.first, initial.last),
    email: lead.email || '',
    phone: lead.phone || '',
    parentPhone: '',
    category: isJuniorPortal ? 'junior' : 'senior',
    subcategory: isJuniorPortal ? 'junior' : 'online',
  });
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: value };
      if (!usernameEdited && (k === 'firstName' || k === 'lastName')) next.username = makeUsername(next.firstName, next.lastName);
      return next;
    });
    if (k === 'username') setUsernameEdited(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lastName.trim()) return void toast.error('Enter the last name');
    setSaving(true);
    try {
      const result = await leadsApi.createStudentFromLead(lead.id, {
        username: form.username.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        parentPhone: form.parentPhone.trim() || undefined,
        studentCategory: form.category,
        studentSubcategory: form.subcategory,
      });
      toast.success(`Student account made: ${result.student.username} / ${result.password}. Enrol them on the Enrollments page.`, { duration: 8000 });
      onCreated(result.lead);
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to make the student account');
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500';
  const subcategories = isJuniorPortal
    ? JUNIOR_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))
    : [{ value: 'online', label: 'Online' }, { value: 'local', label: 'Local' }];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Make student account</h2>
            <p className="text-sm text-gray-500">From the lead "{lead.name}". Password will be Student@123.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">First name *</span>
            <input required value={form.firstName} onChange={set('firstName')} className={input} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Last name *</span>
            <input required value={form.lastName} onChange={set('lastName')} className={input} />
          </label>
          <label className="col-span-2 text-sm">
            <span className="mb-1 block font-medium text-gray-700">Username *</span>
            <input required minLength={3} value={form.username} onChange={set('username')} className={input} />
          </label>
          <label className="col-span-2 text-sm">
            <span className="mb-1 block font-medium text-gray-700">Email</span>
            <input type="email" value={form.email} onChange={set('email')} placeholder="Optional" className={input} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Phone / WhatsApp</span>
            <input value={form.phone} onChange={set('phone')} className={input} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Parent phone</span>
            <input value={form.parentPhone} onChange={set('parentPhone')} placeholder="Optional" className={input} />
          </label>
          <label className="col-span-2 text-sm">
            <span className="mb-1 block font-medium text-gray-700">{isJuniorPortal ? 'Category' : 'Student type'}</span>
            <select value={form.subcategory} onChange={set('subcategory')} className={input}>
              {subcategories.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>

        <p className="text-xs text-gray-500">The lead is marked Enrolled and linked to this student. Next, enrol them in their classes on the Enrollments page.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Make student account'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateStudentFromLeadModal;
