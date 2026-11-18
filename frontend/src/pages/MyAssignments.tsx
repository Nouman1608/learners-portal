import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ArrowLeftIcon, PaperClipIcon } from '@heroicons/react/24/outline';
import assignmentsApi, { MyAssignmentSummary, MyAssignmentDetail, AssignmentFile, filesTooBig } from '../api/assignments.api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';

const day = (value: string | null) => (value ? format(new Date(`${value.slice(0, 10)}T00:00:00`), 'd MMM yyyy') : '');
const size = (bytes: number | null) => (bytes ? (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`) : '');

export const FileLinks: React.FC<{ files: AssignmentFile[] }> = ({ files }) => (
  <ul className="space-y-1">
    {files.map((file) => (
      <li key={file.id}>
        <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm text-indigo-600 hover:underline">
          <PaperClipIcon className="mr-1 h-4 w-4" />{file.fileName} <span className="ml-1 text-xs text-gray-400">{size(file.sizeBytes)}</span>
        </a>
      </li>
    ))}
  </ul>
);

/** A student's assignments: read the instructions, download the files, hand in answers, see marks and feedback */
const MyAssignments: React.FC = () => {
  const [list, setList] = useState<MyAssignmentSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => assignmentsApi.mine().then(setList).catch(() => toast.error('Failed to load your assignments'));
  useEffect(() => { load(); }, []);

  if (openId) return <MyAssignmentView id={openId} onBack={() => { setOpenId(null); load(); }} />;
  if (!list) return <LoadingSpinner />;

  const status = (a: MyAssignmentSummary) => {
    if (a.gradedAt) return { text: a.marks !== null ? `Marked: ${a.marks}${a.maxMarks ? ` / ${a.maxMarks}` : ''}` : 'Marked', style: 'bg-green-100 text-green-800' };
    if (a.submittedAt) return { text: 'Handed in', style: 'bg-blue-100 text-blue-800' };
    if (a.dueDate && a.dueDate.slice(0, 10) < format(new Date(), 'yyyy-MM-dd')) return { text: 'Past due', style: 'bg-red-100 text-red-800' };
    return { text: 'To do', style: 'bg-amber-100 text-amber-800' };
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">My Assignments</h1>
      {list.length === 0 ? (
        <EmptyState title="No assignments yet" description="Assignments your teachers post for you will appear here." />
      ) : (
        <div className="space-y-3">
          {list.map((a) => {
            const s = status(a);
            return (
              <button key={a.id} type="button" onClick={() => setOpenId(a.id)} className="flex w-full items-center justify-between gap-4 rounded-xl bg-white p-4 text-left shadow-card transition-all hover:shadow-card-hover">
                <div>
                  <p className="font-semibold text-gray-900">{a.title}</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {[a.courseTitle, a.teacherName && `by ${a.teacherName}`, a.dueDate && `due ${day(a.dueDate)}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${s.style}`}>{s.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MyAssignmentView: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const [detail, setDetail] = useState<MyAssignmentDetail | null>(null);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => assignmentsApi.mineDetail(id)
    .then((d) => { setDetail(d); setNote(d.submission?.note ?? ''); })
    .catch(() => { toast.error('Failed to load this assignment'); onBack(); });
  useEffect(() => { load(); }, [id]);

  if (!detail) return <LoadingSpinner />;
  const marked = !!detail.submission?.gradedAt;

  const submit = async () => {
    if (files.length === 0 && !note.trim() && !detail.submission) { toast.error('Add a file or a note first'); return; }
    if (filesTooBig(files)) { toast.error('The files are more than 10 MB together. Send fewer or smaller files.'); return; }
    setBusy(true);
    try {
      await assignmentsApi.submit(id, note, files);
      toast.success('Handed in');
      setFiles([]);
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to hand in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeftIcon className="mr-1 h-4 w-4" />All assignments
      </button>
      <div className="rounded-xl bg-white p-6 shadow-card">
        <h1 className="text-xl font-bold text-gray-900">{detail.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {[detail.courseTitle, detail.teacherName && `by ${detail.teacherName}`, detail.dueDate && `due ${day(detail.dueDate)}`, detail.maxMarks && `out of ${detail.maxMarks}`].filter(Boolean).join(' · ')}
        </p>
        {detail.instructions && <p className="mt-4 whitespace-pre-wrap text-sm text-gray-800">{detail.instructions}</p>}
        {detail.files.length > 0 && (
          <div className="mt-4">
            <h2 className="mb-1 text-sm font-semibold text-gray-900">Files from your teacher</h2>
            <FileLinks files={detail.files} />
          </div>
        )}
      </div>

      {marked && detail.submission && (
        <div className="mt-4 rounded-xl border-l-4 border-green-500 bg-white p-6 shadow-card">
          <h2 className="text-sm font-semibold text-gray-900">Marked</h2>
          {detail.submission.marks !== null && (
            <p className="mt-1 text-2xl font-bold text-green-700">{detail.submission.marks}{detail.maxMarks ? <span className="text-base font-medium text-gray-500"> / {detail.maxMarks}</span> : null}</p>
          )}
          {detail.submission.feedback && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{detail.submission.feedback}</p>}
        </div>
      )}

      <div className="mt-4 rounded-xl bg-white p-6 shadow-card">
        <h2 className="text-sm font-semibold text-gray-900">Your answer</h2>
        {detail.submission && (
          <div className="mt-2 text-sm text-gray-600">
            Handed in {format(new Date(detail.submission.submittedAt), 'd MMM yyyy, h:mm a')}
            {detail.submission.files.length > 0 && <div className="mt-2"><FileLinks files={detail.submission.files} /></div>}
          </div>
        )}
        {marked ? (
          <p className="mt-3 text-sm text-gray-500">This has been marked, so it can no longer be changed.</p>
        ) : (
          <>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="A note for your teacher (optional)"
              className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            />
            <div className="mt-3">
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700"
              />
              <p className="mt-1 text-xs text-gray-500">
                Up to 5 files, 10 MB in total: PDF, photos, Word, Excel, PowerPoint, text or zip.
                {detail.submission && ' New files replace the ones you handed in before.'}
              </p>
            </div>
            <button type="button" onClick={submit} disabled={busy} className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? 'Uploading...' : detail.submission ? 'Hand in again' : 'Hand in'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default MyAssignments;
