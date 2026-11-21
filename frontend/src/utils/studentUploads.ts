export const MAX_UPLOAD_BYTES = 9.5 * 1024 * 1024; // Leave room for multipart headers under nginx's 10 MB limit.
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const ASSIGNMENT_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip';
export const ANSWER_ACCEPT = 'image/*,.pdf,application/pdf';
const documentExtensions = /\.(docx?|xlsx?|pptx?|txt|zip)$/i;
export const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
export const isImage = (file: File) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|hei[cf]|bmp|avif|tiff?)$/i.test(file.name);
export const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

/** Append repeated camera/gallery selections; never silently truncate or replace earlier pages. */
export function addStudentFiles(current: File[], incoming: File[], maxFiles: number, documents = false): File[] {
  const result = [...current];
  for (const file of incoming) {
    if (!isPdf(file) && !isImage(file) && !(documents && documentExtensions.test(file.name))) {
      throw new Error(`${file.name}: choose a photo or PDF${documents ? ', document, text or zip file' : ''}.`);
    }
    if (!file.size) throw new Error(`${file.name} is empty. Choose another file.`);
    if (!result.some(selected => fileKey(selected) === fileKey(file))) result.push(file);
  }
  if (result.length > maxFiles) throw new Error(`You can add up to ${maxFiles} files. Remove a file before adding more.`);
  if (result.reduce((total, file) => total + file.size, 0) > MAX_SOURCE_BYTES) {
    throw new Error('These files are more than 30 MB together. Add fewer or smaller files.');
  }
  return result;
}

export async function photoForUpload(file: File): Promise<{ file: File; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`${file.name} could not be opened. Save it as JPG or PNG and try again.`));
      image.src = url;
    });
    const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the photo. Try a different browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(`Could not prepare ${file.name}.`)), 'image/jpeg', 0.85));
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`;
    return { file: new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified }), width: canvas.width, height: canvas.height };
  } finally {
    image.src = '';
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}

export async function prepareAssignmentFiles(files: File[], progress?: (current: number, total: number) => void): Promise<File[]> {
  addStudentFiles([], files, 5, true);
  const prepared: File[] = [];
  for (const [index, file] of files.entries()) {
    progress?.(index + 1, files.length);
    // Preserve formats the assignment endpoint already accepts; resize large camera photos.
    if (isImage(file) && !/\.(gif|heic)$/i.test(file.name)) prepared.push((await photoForUpload(file)).file);
    else if (isPdf(file)) prepared.push(new File([file], /\.pdf$/i.test(file.name) ? file.name : `${file.name}.pdf`, { type: 'application/pdf' }));
    else prepared.push(file);
  }
  if (prepared.reduce((sum, file) => sum + file.size, 0) > MAX_UPLOAD_BYTES) throw new Error('The upload is still too large. Keep PDFs and documents below 10 MB together, or send fewer photos.');
  return prepared;
}

/** Keep the existing PDF marking/annotation pipeline while accepting photos and multiple PDFs. */
export async function prepareAssessmentSubmission(files: File[], progress?: (current: number, total: number) => void): Promise<File> {
  if (!files.length) throw new Error('Add a photo or PDF first.');
  addStudentFiles([], files, 20);
  const { PDFDocument } = await import('pdf-lib');
  const combined = await PDFDocument.create();
  for (const [index, file] of files.entries()) {
    progress?.(index + 1, files.length);
    if (isPdf(file)) {
      let source;
      try { source = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false }); }
      catch { throw new Error(`${file.name} could not be opened. Use a valid PDF without password protection.`); }
      if (!source.getPageCount()) throw new Error(`${file.name} has no pages.`);
      if (combined.getPageCount() + source.getPageCount() > 100) throw new Error('Submit no more than 100 pages at a time.');
      if (files.length === 1) {
        if (file.size > MAX_UPLOAD_BYTES) throw new Error('Your PDF must be smaller than 10 MB.');
        return new File([file], /\.pdf$/i.test(file.name) ? file.name : `${file.name}.pdf`, { type: 'application/pdf' });
      }
      try {
        if (source.getForm().getFields().length) source.getForm().flatten({ updateFieldAppearances: false });
        const pages = await combined.copyPages(source, source.getPageIndices());
        pages.forEach(page => combined.addPage(page));
      } catch { throw new Error(`${file.name} could not be combined. Save or print it as a new PDF and try again.`); }
    } else {
      if (combined.getPageCount() >= 100) throw new Error('Submit no more than 100 pages at a time.');
      const photo = await photoForUpload(file);
      const embedded = await combined.embedJpg(await photo.file.arrayBuffer());
      const landscape = photo.width > photo.height;
      const page = combined.addPage(landscape ? [841.89, 595.28] : [595.28, 841.89]);
      const { width, height } = page.getSize();
      const scale = Math.min((width - 36) / photo.width, (height - 36) / photo.height);
      const w = photo.width * scale, h = photo.height * scale;
      page.drawImage(embedded, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
    }
  }
  const bytes = await combined.save();
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('Your combined work is larger than 10 MB. Remove a file or use a smaller PDF.');
  return new File([new Uint8Array(bytes).buffer], 'assessment-answers.pdf', { type: 'application/pdf' });
}
