import { useEffect, useRef, useState } from 'react';
import { addStudentFiles, ANSWER_ACCEPT, ASSIGNMENT_ACCEPT, fileKey, isImage } from '../../utils/studentUploads';

function Thumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isImage(file)) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url && !failed ? <img src={url} alt={`Preview of ${file.name}`} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-12 w-12 shrink-0 rounded bg-white object-contain" />
    : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-indigo-50 text-xs text-indigo-700">File</span>;
}

interface Props { files: File[]; onChange: (files: File[]) => void; disabled?: boolean; maxFiles?: number; documents?: boolean }
export default function StudentFilePicker({ files, onChange, disabled = false, maxFiles = 20, documents = false }: Props) {
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null), folder = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const add = (input: HTMLInputElement) => {
    const incoming = Array.from(input.files ?? []);
    input.value = '';
    if (!incoming.length) return;
    try { onChange(addStudentFiles(files, incoming, maxFiles, documents)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add these files.'); }
  };
  const move = (index: number, offset: number) => {
    const reordered = [...files];
    [reordered[index], reordered[index + offset]] = [reordered[index + offset], reordered[index]];
    onChange(reordered);
  };
  const button = 'min-h-11 rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50';
  return (
    <div className="space-y-3" aria-label="Your answer files">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={disabled} onClick={() => camera.current?.click()}>Take photo</button>
        <button type="button" className={button} disabled={disabled} onClick={() => gallery.current?.click()}>Gallery</button>
        <button type="button" className={button} disabled={disabled} onClick={() => folder.current?.click()}>Files / PDFs</button>
      </div>
      <input ref={camera} type="file" data-source="camera" className="hidden" accept="image/*" capture="environment" disabled={disabled} onChange={e => add(e.currentTarget)} />
      <input ref={gallery} type="file" data-source="gallery" className="hidden" accept="image/*" multiple disabled={disabled} onChange={e => add(e.currentTarget)} />
      <input ref={folder} type="file" data-source="files" className="hidden" accept={documents ? ASSIGNMENT_ACCEPT : ANSWER_ACCEPT} multiple disabled={disabled} onChange={e => add(e.currentTarget)} />
      <p className="text-sm text-gray-500">Add up to {maxFiles} files. Take another photo or choose more files to add pages.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {files.length > 0 && (
        <ol className="space-y-2" aria-label="Selected files in submission order">
          {files.map((file, index) => (
            <li key={fileKey(file)} className="rounded-md border border-gray-200 bg-gray-50 p-2">
              <div className="flex min-w-0 items-center gap-2">
                <Thumbnail file={file} />
                <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium text-gray-800">{index + 1}. {file.name}</p><p className="text-xs text-gray-500">{(file.size / 1048576).toFixed(1)} MB</p></div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <button type="button" className="min-h-11 rounded px-2 text-sm text-indigo-700 disabled:opacity-40" aria-label={`Move ${file.name} earlier`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>Earlier</button>
                <button type="button" className="min-h-11 rounded px-2 text-sm text-indigo-700 disabled:opacity-40" aria-label={`Move ${file.name} later`} disabled={disabled || index === files.length - 1} onClick={() => move(index, 1)}>Later</button>
                <button type="button" className="min-h-11 rounded px-2 text-sm text-red-700" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => { onChange(files.filter((_, i) => i !== index)); setError(''); }}>Remove</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
