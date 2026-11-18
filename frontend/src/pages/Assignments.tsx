import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ArrowLeftIcon, PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import assignmentsApi, {
  AssignmentSummary, AssignmentDetail, AudienceClass, AssignmentFormValues, filesTooBig,
} from '../api/assignments.api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import { FileLinks } from './MyAssignments';

const day = (value: string | null) => (value ? format(new Date(`${value.slice(0, 10)}T00:00:00`), 'd MMM yyyy') : '');
const FILE_TYPES = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip';
const field = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500';

/**
 * Teachers, admins and sudo: post assignments (instructions and files) to a class or to chosen
 * students, see who has handed in, and mark the answers. A teacher sees only their own classes.
 */
const Assignments: React.FC = () => {
  const [list, setList] = useState<AssignmentSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => assignmentsApi.list().then(setList).catch(() => toast.error('Failed to load the assignments'));
  useEffect(() => { load(); }, []);

  if (creating) return <AssignmentForm onDone={(id) => { setCreating(false); load(); if (id) setOpenId(id); }} />;
  if (openId) return <AssignmentView id={openId} onBack={() => { setOpenId(null); load(); }} />;
  if (!list) return <LoadingSpinner />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <PlusIcon className="mr-2 h-4 w-4" />New assignment
        </button>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No assignments yet" description="Post an assignment to a class or to chosen students." action={{ label: 'New assignment', onClick: () => setCreating(true) }} />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-card">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Assignment</th>
                <th className="px-4 py-3 text-left font-medium">For</th>
                <th className="px-4 py-3 text-left font-medium">Due</th>
                <th className="px-4 py-3 text-right font-medium">Handed in</th>
                <th className="px-4 py-3 text-right font-medium">Marked</th>
                <th className="px-4 py-3 text-left font-medium">Posted by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((a) => (
                <tr key={a.id} onClick={() => setOpenId(a.id)} className="cursor-pointer hover:bg-indigo-50/40">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.title}{a.fileCount > 0 && <span className="ml-2 text-xs font-normal text-gray-400">{a.fileCount} file{a.fileCount === 1 ? '' : 's'}</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{a.courseTitle ?? `${a.audienceCount} chosen student${a.audienceCount === 1 ? '' : 's'}`}</td>
                  <td className="px-4 py-3 text-gray-600">{day(a.dueDate) || '-'}</td>
                  <td className="px-4 py-3 text-right">{a.submittedCount} / {a.audienceCount}</td>
                  <td className="px-4 py-3 text-right">{a.gradedCount} / {a.submittedCount}</td>
                  <td className="px-4 py-3 text-gray-600">{a.createdByName ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/** Post a new assignment, or (with `editing`) change the title, text, due date, marks and files of one */
const AssignmentForm: React.FC<{ onDone: (id?: string) => void; editing?: AssignmentDetail }> = ({ onDone, editing }) => {
  const [classes, setClasses] = useState<AudienceClass[]>([]);
  const [values, setValues] = useState<AssignmentFormValues>({
    title: editing?.title ?? '', instructions: editing?.instructions ?? '', dueDate: editing?.dueDate?.slice(0, 10) ?? '',
    maxMarks: editing?.maxMarks ? String(editing.maxMarks) : '', courseId: '', studentIds: [], files: [], removeFileIds: [],
  });
  const [mode, setMode] = useState<'class' | 'students'>('class');
  const [pickClass, setPickClass] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) assignmentsApi.audience().then(setClasses).catch(() => toast.error('Failed to load your classes'));
  }, []);

  const set = (patch: Partial<AssignmentFormValues>) => setValues((current) => ({ ...current, ...patch }));
  // Students to choose from: every student of the classes, once (a student in two classes is listed once)
  const students = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; classes: string[] }>();
    for (const c of classes) {
      if (pickClass && c.courseId !== pickClass) continue;
      for (const s of c.students) {
        const entry = seen.get(s.id) ?? { ...s, classes: [] };
        entry.classes.push(c.title);
        seen.set(s.id, entry);
      }
    }
    const query = search.trim().toLowerCase();
    return [...seen.values()].filter((s) => !query || s.name.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, pickClass, search]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) { toast.error('Give the assignment a title'); return; }
    if (filesTooBig(values.files)) { toast.error('The files are more than 10 MB together. Attach fewer or smaller files.'); return; }
    if (!editing) {
      if (mode === 'class' && !values.courseId) { toast.error('Choose a class'); return; }
      if (mode === 'students' && values.studentIds.length === 0) { toast.error('Choose at least one student'); return; }
    }
    setBusy(true);
    try {
      if (editing) {
        await assignmentsApi.update(editing.id, values);
        toast.success('Saved');
        onDone(editing.id);
      } else {
        const id = await assignmentsApi.create({ ...values, courseId: mode === 'class' ? values.courseId : '', studentIds: mode === 'students' ? values.studentIds : [] });
        toast.success('Posted. Students are being notified.');
        onDone(id);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-4">
      <button type="button" onClick={() => onDone()} className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeftIcon className="mr-1 h-4 w-4" />Back
      </button>
      <h1 className="text-2xl font-bold text-gray-900">{editing ? 'Edit assignment' : 'New assignment'}</h1>

      <div className="space-y-4 rounded-xl bg-white p-6 shadow-card">
        <label className="block text-sm font-medium text-gray-700">Title
          <input value={values.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} className={`mt-1 ${field}`} />
        </label>
        <label className="block text-sm font-medium text-gray-700">Instructions (optional)
          <textarea value={values.instructions} onChange={(e) => set({ instructions: e.target.value })} rows={4} className={`mt-1 ${field}`} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">Due date (optional)
            <input type="date" value={values.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="block text-sm font-medium text-gray-700">Marks out of (optional)
            <input inputMode="decimal" value={values.maxMarks} onChange={(e) => set({ maxMarks: e.target.value })} placeholder="e.g. 20" className={`mt-1 ${field}`} />
          </label>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-gray-700">Files (optional)</p>
          {editing && editing.files.filter((f) => !values.removeFileIds?.includes(f.id)).map((file) => (
            <div key={file.id} className="mb-1 flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm">
              <span>{file.fileName}</span>
              <button type="button" onClick={() => set({ removeFileIds: [...(values.removeFileIds ?? []), file.id] })} className="text-red-600 hover:underline">Remove</button>
            </div>
          ))}
          <input
            type="file" multiple accept={FILE_TYPES}
            onChange={(e) => set({ files: Array.from(e.target.files ?? []).slice(0, 5) })}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700"
          />
          <p className="mt-1 text-xs text-gray-500">Up to 5 files, 10 MB in total: PDF, photos, Word, Excel, PowerPoint, text or zip.</p>
        </div>
      </div>

      {!editing && (
        <div className="space-y-3 rounded-xl bg-white p-6 shadow-card">
          <p className="text-sm font-medium text-gray-700">Who is it for?</p>
          <div className="flex gap-4 text-sm">
            <label className="inline-flex items-center gap-2"><input type="radio" checked={mode === 'class'} onChange={() => setMode('class')} />A whole class</label>
            <label className="inline-flex items-center gap-2"><input type="radio" checked={mode === 'students'} onChange={() => setMode('students')} />Chosen students</label>
          </div>
          {mode === 'class' ? (
            <>
              <select value={values.courseId} onChange={(e) => set({ courseId: e.target.value })} className={field}>
                <option value="">Choose a class...</option>
                {classes.map((c) => <option key={c.courseId} value={c.courseId}>{c.title} ({c.students.length} students)</option>)}
              </select>
              <p className="text-xs text-gray-500">Every student enrolled in the class gets it, also students who join later.</p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <select value={pickClass} onChange={(e) => setPickClass(e.target.value)} className={`${field} sm:w-72`}>
                  <option value="">All my classes</option>
                  {classes.map((c) => <option key={c.courseId} value={c.courseId}>{c.title}</option>)}
                </select>
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students..." className={`${field} sm:w-60`} />
              </div>
              <div className="max-h-64 overflow-auto rounded-md border border-gray-200">
                {students.length === 0 && <p className="p-3 text-sm text-gray-500">No students found</p>}
                {students.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={values.studentIds.includes(s.id)}
                      onChange={(e) => set({ studentIds: e.target.checked ? [...values.studentIds, s.id] : values.studentIds.filter((id) => id !== s.id) })}
                    />
                    <span className="text-gray-900">{s.name}</span>
                    <span className="truncate text-xs text-gray-400">{s.classes.join(', ')}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500">{values.studentIds.length} chosen</p>
            </>
          )}
        </div>
      )}

      <button type="submit" disabled={busy} className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
        {busy ? 'Saving...' : editing ? 'Save changes' : 'Post assignment'}
      </button>
    </form>
  );
};

/** One assignment: its text and files, and every student's hand-in with marks and feedback */
const AssignmentView: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [marking, setMarking] = useState<Record<string, { marks: string; feedback: string }>>({});

  const load = () => assignmentsApi.get(id).then((d) => {
    setDetail(d);
    setMarking(Object.fromEntries(d.students.map((s) => [s.id, { marks: s.submission?.marks?.toString() ?? '', feedback: s.submission?.feedback ?? '' }])));
  }).catch(() => { toast.error('Failed to load this assignment'); onBack(); });
  useEffect(() => { load(); }, [id]);

  if (editing && detail) return <AssignmentForm editing={detail} onDone={() => { setEditing(false); load(); }} />;
  if (!detail) return <LoadingSpinner />;

  const save = async (studentId: string) => {
    try {
      await assignmentsApi.grade(id, studentId, marking[studentId].marks, marking[studentId].feedback);
      toast.success('Saved');
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save');
    }
  };
  const remove = async () => {
    if (!window.confirm('Delete this assignment, with all the answers handed in? This cannot be undone.')) return;
    try {
      await assignmentsApi.remove(id);
      toast.success('Deleted');
      onBack();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete');
    }
  };

  const handedIn = detail.students.filter((s) => s.submission).length;
  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeftIcon className="mr-1 h-4 w-4" />All assignments
      </button>
      <div className="rounded-xl bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{detail.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {[detail.courseTitle ?? `${detail.students.length} chosen students`, detail.dueDate && `due ${day(detail.dueDate)}`, detail.maxMarks && `out of ${detail.maxMarks}`, `${handedIn} of ${detail.students.length} handed in`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"><PencilIcon className="mr-1 h-4 w-4" />Edit</button>
            <button type="button" onClick={remove} className="inline-flex items-center rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"><TrashIcon className="mr-1 h-4 w-4" />Delete</button>
          </div>
        </div>
        {detail.instructions && <p className="mt-4 whitespace-pre-wrap text-sm text-gray-800">{detail.instructions}</p>}
        {detail.files.length > 0 && <div className="mt-4"><FileLinks files={detail.files} /></div>}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl bg-white shadow-card">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Student</th>
              <th className="px-4 py-3 text-left font-medium">Handed in</th>
              <th className="px-4 py-3 text-left font-medium">Marks{detail.maxMarks ? ` / ${detail.maxMarks}` : ''}</th>
              <th className="px-4 py-3 text-left font-medium">Feedback</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 align-top">
            {detail.students.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No students</td></tr>}
            {detail.students.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                <td className="px-4 py-3">
                  {s.submission ? (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">{format(new Date(s.submission.submittedAt), 'd MMM, h:mm a')}</p>
                      <FileLinks files={s.submission.files} />
                      {s.submission.note && <p className="whitespace-pre-wrap text-gray-700">{s.submission.note}</p>}
                    </div>
                  ) : <span className="text-gray-400">Not yet</span>}
                </td>
                {s.submission ? (
                  <>
                    <td className="px-4 py-3">
                      <input
                        inputMode="decimal" value={marking[s.id]?.marks ?? ''} className="w-20 rounded-md border border-gray-300 px-2 py-1"
                        onChange={(e) => setMarking({ ...marking, [s.id]: { ...marking[s.id], marks: e.target.value } })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <textarea
                        rows={2} value={marking[s.id]?.feedback ?? ''} className="w-full min-w-[12rem] rounded-md border border-gray-300 px-2 py-1"
                        onChange={(e) => setMarking({ ...marking, [s.id]: { ...marking[s.id], feedback: e.target.value } })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => save(s.id)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700">
                        {s.submission.gradedAt ? 'Update' : 'Save'}
                      </button>
                    </td>
                  </>
                ) : <td colSpan={3} />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Assignments;
