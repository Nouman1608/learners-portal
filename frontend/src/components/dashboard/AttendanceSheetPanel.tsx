import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PrinterIcon } from '@heroicons/react/24/outline';
import { Campus, AttendanceSheetData, SheetClass, getAttendanceSheet } from '../../api/dashboard.api';
import { brand, terms } from '../../brand';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BLANK_COLUMNS = 12; // a class with no fixed days (e.g. 1-to-1): empty columns to write the dates in

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** One class as a printable page: students down the side, the month's class days across */
function sheetHtml(cls: SheetClass, month: number, year: number, campusLabel: string): string {
  const columns = cls.dates.length
    ? cls.dates.map(({ date }) => {
        const d = new Date(`${date}T00:00:00`);
        return `<th class="day"><span>${WEEKDAYS[d.getDay()]}</span><br>${d.getDate()}</th>`;
      })
    : Array.from({ length: BLANK_COLUMNS }, () => '<th class="day"><span>&nbsp;</span><br>&nbsp;</th>');
  const count = cls.dates.length || BLANK_COLUMNS;
  const emptyCells = Array.from({ length: count }, () => '<td></td>').join('');
  const rows = cls.students.map((student, index) =>
    `<tr><td class="no">${index + 1}</td><td class="name">${escapeHtml(student.name)}</td>${emptyCells}</tr>`).join('');
  // A few empty lines at the end for students who join during the month
  const spare = Array.from({ length: 3 }, (_, i) =>
    `<tr><td class="no">${cls.students.length + i + 1}</td><td class="name"></td>${emptyCells}</tr>`).join('');
  return `
    <section>
      <header>
        <div><strong>${escapeHtml(campusLabel)}</strong> · Attendance sheet</div>
        <div class="month">${MONTHS[month - 1]} ${year}</div>
      </header>
      <h2>${escapeHtml(cls.title)}</h2>
      <p class="meta">Teacher: <strong>${escapeHtml(cls.teachers.join(', ') || '-')}</strong> · ${cls.students.length} student${cls.students.length === 1 ? '' : 's'}</p>
      <table>
        <thead><tr><th class="no">#</th><th class="name">Student</th>${columns.join('')}</tr></thead>
        <tbody>${rows}${spare}</tbody>
      </table>
      <p class="key">Mark: P present · A absent · L late · Lv on leave</p>
      <p class="sign">Teacher's signature: ______________________</p>
    </section>`;
}

/** Opens the sheets in a new window and starts printing (the browser's print box can also save a PDF) */
function printSheets(data: AttendanceSheetData, campus: Campus) {
  const label = (cls: SheetClass) => (campus === 'both' && cls.campus ? (cls.campus === 'junior' ? 'Junior Campus' : 'Senior Campus') : brand.name);
  const pages = data.classes.map((cls) => sheetHtml(cls, data.month, data.year, label(cls))).join('');
  const win = window.open('', '_blank');
  if (!win) {
    toast.error('The print window was blocked. Allow pop-ups for this site and try again.');
    return;
  }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Attendance sheets ${MONTHS[data.month - 1]} ${data.year}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
      section { page-break-after: always; }
      section:last-child { page-break-after: auto; }
      header { display: flex; justify-content: space-between; font-size: 12px; border-bottom: 2px solid #111; padding-bottom: 4px; }
      .month { font-weight: bold; font-size: 14px; }
      h2 { margin: 8px 0 2px; font-size: 18px; }
      .meta { margin: 0 0 8px; font-size: 12px; }
      table { border-collapse: collapse; width: 100%; font-size: 11px; }
      th, td { border: 1px solid #444; padding: 0; height: 21px; text-align: center; }
      th { background: #eee; font-weight: bold; }
      th.day { font-size: 10px; width: 24px; } th.day span { font-weight: normal; font-size: 8px; }
      td.no, th.no { width: 24px; }
      td.name, th.name { text-align: left; padding: 0 6px; width: 190px; white-space: nowrap; }
      .key { font-size: 10px; margin: 6px 0 0; }
      .sign { font-size: 12px; margin: 14px 0 0; }
      tr { page-break-inside: avoid; }
    </style></head><body>${pages}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

/**
 * Admin / sudo dashboard: print the month's attendance sheets for the teachers. Pick the month
 * and a teacher (or everyone), then print: one page per class with the enrolled students down
 * the side and the class days across, to be marked by hand.
 */
export default function AttendanceSheetPanel({ campus }: { campus: Campus }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [teacherId, setTeacherId] = useState('');
  const [teachers, setTeachers] = useState<AttendanceSheetData['teachers']>([]);
  const [busy, setBusy] = useState(false);

  // The teachers who have classes with students (a new campus or month starts from everyone)
  useEffect(() => {
    let current = true;
    getAttendanceSheet(campus, month, year, '00000000-0000-0000-0000-000000000000')
      .then((data) => { if (current) setTeachers(data.teachers); })
      .catch(() => undefined);
    setTeacherId('');
    return () => { current = false; };
  }, [campus, month, year]);

  // The last 12 months and next month, newest first
  const choices = (() => {
    const last = now.getFullYear() * 12 + now.getMonth() + 1;
    return Array.from({ length: 13 }, (_, i) => last - i).map((index) => ({
      value: `${Math.floor(index / 12)}-${(index % 12) + 1}`,
      label: `${MONTHS[index % 12]} ${Math.floor(index / 12)}`,
    }));
  })();

  const print = async () => {
    setBusy(true);
    try {
      const data = await getAttendanceSheet(campus, month, year, teacherId || undefined);
      if (data.classes.length === 0) {
        toast.error('No classes with students found');
        return;
      }
      printSheets(data, campus);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to prepare the attendance sheets');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-8 rounded-xl bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Monthly attendance sheets</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Print one page per {terms.courseLc} for the teachers to mark by hand: students down the side, the month's {terms.courseLc} days across.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={`${year}-${month}`}
            onChange={(e) => { const [y, m] = e.target.value.split('-').map(Number); setYear(y); setMonth(m); }}
            aria-label="Month"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
          >
            {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select>
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            aria-label="Teacher"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All teachers</option>
            {teachers.map((teacher) => <option key={`${teacher.campus || ''}-${teacher.id}`} value={teacher.id}>{teacher.name}{teacher.campus ? ` (${teacher.campus === 'junior' ? 'Junior' : 'Senior'})` : ''}</option>)}
          </select>
          <button
            type="button"
            onClick={print}
            disabled={busy}
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <PrinterIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            {busy ? 'Preparing...' : 'Print sheets'}
          </button>
        </div>
      </div>
    </div>
  );
}
