/**
 * Minimal CSV export for analytics tables.
 */

type Column<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

/** Escapes a value for CSV: quotes it and doubles any embedded quotes. */
function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // A leading =, +, - or @ makes spreadsheets treat the cell as a formula.
  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const header = columns.map(c => escapeCell(c.header)).join(',');
  const body = rows.map(row => columns.map(c => escapeCell(c.value(row))).join(','));
  return [header, ...body].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // The BOM makes Excel read UTF-8 correctly, so currency symbols survive.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportCsv<T>(filename: string, rows: T[], columns: Column<T>[]): void {
  downloadCsv(filename, toCsv(rows, columns));
}

/** Appends a date stamp so exported files do not overwrite each other. */
export function stampedFilename(base: string): string {
  return `${base}-${new Date().toISOString().split('T')[0]}.csv`;
}
