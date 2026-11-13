import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { usersApi, Family, FamilyMember } from '../../api/users.api';
import { User } from '../../types';
import { isJuniorPortal } from '../../brand';
import SearchableSelect from '../common/SearchableSelect';

interface SiblingsFieldProps {
  /** The student being edited. Leave out while creating a new student. */
  userId?: string;
  /** New student: the brother or sister picked (linked when the student is saved) */
  siblingOfId?: string;
  onPickSibling?: (sibling: User | null) => void;
  /** Called after a link is added or removed on an existing student */
  onChanged?: () => void;
  disabled?: boolean;
}

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;
const OTHER_CAMPUS = isJuniorPortal ? 'Senior Campus' : 'Junior Campus';
const pickerOption = (s: { id: string; username: string; firstName: string; lastName: string; phone?: string | null; parentPhone?: string | null }) =>
  ({ value: s.id, label: fullName(s), sublabel: [`@${s.username}`, s.parentPhone || s.phone].filter(Boolean).join(' · ') });

/**
 * Siblings on the student form. Linked students are one family: the Invoices page can then
 * make one family invoice for all of them. On an existing student, links save straight away.
 * A sibling may also study in the other campus (Senior <-> Junior).
 */
export default function SiblingsField({ userId, siblingOfId, onPickSibling, onChanged, disabled }: SiblingsFieldProps) {
  const [students, setStudents] = useState<User[]>([]);
  const [otherStudents, setOtherStudents] = useState<FamilyMember[] | null>(null); // null = not connected
  const [family, setFamily] = useState<Family | null>(null);
  const [picked, setPicked] = useState('');
  const [pickedOther, setPickedOther] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    usersApi.getUsers({ role: 'student', limit: 10000 }).then(setStudents)
      .catch(() => toast.error('Failed to load students'));
  }, []);

  useEffect(() => {
    if (!userId) return;
    usersApi.getFamily(userId).then(setFamily).catch(() => toast.error('Failed to load siblings'));
    usersApi.getOtherCampusStudents().then((r) => setOtherStudents(r.available ? r.students : null))
      .catch(() => setOtherStudents(null));
  }, [userId]);

  const linked = useMemo(() => new Set(family?.siblings.map((s) => `${s.campus || 'own'}:${s.id}`)), [family]);
  const options = useMemo(
    () => students.filter((s) => s.id !== userId && !linked.has(`own:${s.id}`)).map(pickerOption),
    [students, linked, userId],
  );
  const otherOptions = useMemo(
    () => (otherStudents || []).filter((s) => !linked.has(`other:${s.id}`)).map(pickerOption),
    [otherStudents, linked],
  );

  const run = async (action: () => Promise<Family>, done: string) => {
    setSaving(true);
    try {
      setFamily(await action());
      setPicked('');
      setPickedOther('');
      toast.success(done);
      onChanged?.();
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Could not update siblings');
    } finally {
      setSaving(false);
    }
  };

  const link = (id: string, campus: 'own' | 'other' = 'own') =>
    run(() => usersApi.linkSibling(userId!, id, campus), 'Sibling linked');

  const busy = disabled || saving;

  // New student: just choose the brother or sister; the link is made when the student is saved
  if (!userId) {
    return (
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 mb-1">Sibling of (optional)</label>
        <SearchableSelect
          options={options}
          value={siblingOfId || ''}
          onChange={(value) => onPickSibling?.(students.find((s) => s.id === value) || null)}
          placeholder="Choose a brother or sister already in the portal"
          disabled={busy}
        />
        <p className="mt-1 text-xs text-gray-500">
          Siblings get one family invoice. Empty phone numbers here are filled from the sibling.
          A sibling in the {OTHER_CAMPUS} can be linked after saving (edit the student).
        </p>
      </div>
    );
  }

  return (
    <div className="md:col-span-2 rounded-md border border-gray-200 p-3">
      <div className="text-sm font-medium text-gray-700">Siblings</div>
      <p className="mb-2 text-xs text-gray-500">Linked siblings get one family invoice (Invoices page). Changes here save straight away.</p>

      {family && family.siblings.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {family.siblings.map((s) => (
            <span key={`${s.campus}:${s.id}`} className={`rounded-full px-3 py-1 text-sm ${s.campus === 'other' ? 'bg-amber-50 text-amber-900' : 'bg-indigo-50 text-indigo-800'}`}>
              {fullName(s)}{s.campus === 'other' && ` (${OTHER_CAMPUS})`}{!s.isActive && ' (inactive)'}
            </span>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => usersApi.unlinkFamily(userId), 'Removed from the family')}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            Remove this student from the family
          </button>
        </div>
      ) : (
        <p className="mb-2 text-sm text-gray-400">No siblings linked.</p>
      )}

      {family && family.suggestions.length > 0 && (
        <div className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Same phone number:
          {family.suggestions.map((s) => (
            <span key={`${s.campus}:${s.id}`} className="ml-2 inline-flex items-center gap-1">
              {fullName(s)}{s.campus === 'other' && ` (${OTHER_CAMPUS})`}
              <button type="button" disabled={busy} onClick={() => link(s.id, s.campus || 'own')} className="font-medium text-indigo-700 hover:underline disabled:opacity-50">
                Link
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        <div className="flex-1">
          <SearchableSelect options={options} value={picked} onChange={setPicked} placeholder="Add a sibling from this campus..." disabled={busy} />
        </div>
        <button
          type="button"
          disabled={busy || !picked}
          onClick={() => link(picked)}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Link
        </button>
      </div>

      {/* A brother or sister who studies in the other campus */}
      {otherStudents ? (
        <div className="mt-2 flex items-start gap-2">
          <div className="flex-1">
            <SearchableSelect options={otherOptions} value={pickedOther} onChange={setPickedOther} placeholder={`Add a sibling from the ${OTHER_CAMPUS}...`} disabled={busy} />
          </div>
          <button
            type="button"
            disabled={busy || !pickedOther}
            onClick={() => link(pickedOther, 'other')}
            className="rounded-md bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Link
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-400">The {OTHER_CAMPUS} is not connected right now, so siblings there cannot be linked from here.</p>
      )}
    </div>
  );
}
