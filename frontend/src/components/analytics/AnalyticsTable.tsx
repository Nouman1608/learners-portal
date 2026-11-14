import { ReactNode, useMemo, useState } from 'react';
import { ChevronUpIcon, ChevronDownIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  /** What the column sorts by. Text columns are also what the search box looks through. */
  value: (row: T) => string | number | null | undefined;
  /** How the cell is shown (defaults to the value) */
  cell?: (row: T) => ReactNode;
  className?: string | ((row: T) => string);
}

export interface TableFilter<T> {
  label: string; // shown as the "all" choice, e.g. "All results"
  options: { label: string; test: (row: T) => boolean }[];
}

interface AnalyticsTableProps<T> {
  title: string;
  description?: ReactNode;
  rows: T[];
  columns: TableColumn<T>[];
  rowKey: (row: T, index: number) => string;
  searchPlaceholder?: string;
  filters?: TableFilter<T>[];
  emptyText?: string;
  /** Extra buttons beside the search box, e.g. Export */
  actions?: ReactNode;
  /** A totals row for the rows currently shown */
  footer?: (rows: T[]) => ReactNode;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
}

/**
 * The analytics tables' shared frame: click a heading to sort (again to reverse), type to
 * search the text columns, and narrow down with the drop-down filters.
 */
export default function AnalyticsTable<T>({
  title, description, rows, columns, rowKey, searchPlaceholder = 'Search...', filters = [], emptyText = 'Nothing to show',
  actions, footer, defaultSort,
}: AnalyticsTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(defaultSort ?? null);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<number[]>(() => filters.map(() => -1)); // -1 = all

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = rows.filter((row) => {
      for (let i = 0; i < filters.length; i++) {
        const option = filters[i].options[chosen[i]];
        if (option && !option.test(row)) return false;
      }
      if (!query) return true;
      return columns.some((column) => {
        const value = column.value(row);
        return typeof value === 'string' && value.toLowerCase().includes(query);
      });
    });

    const column = sort && columns.find((c) => c.key === sort.key);
    if (column && sort) {
      const direction = sort.direction === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => {
        const x = column.value(a);
        const y = column.value(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1; // blanks always last
        if (y == null) return -1;
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * direction;
        return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }) * direction;
      });
    }
    return list;
  }, [rows, columns, filters, chosen, search, sort]);

  // First click on a number column shows the biggest first; on a text column, A to Z
  const requestSort = (column: TableColumn<T>) => setSort((current) => {
    if (current?.key === column.key) return { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    const sample = rows.map((row) => column.value(row)).find((v) => v != null);
    return { key: column.key, direction: typeof sample === 'number' ? 'desc' : 'asc' };
  });

  const filtering = search.trim() !== '' || chosen.some((c) => c !== -1);

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
          {actions}
        </div>
        {rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-60 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
            />
            {filters.map((filter, index) => (
              <select
                key={filter.label}
                value={chosen[index]}
                onChange={(e) => setChosen((current) => current.map((c, i) => (i === index ? Number(e.target.value) : c)))}
                aria-label={filter.label}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value={-1}>{filter.label}</option>
                {filter.options.map((option, i) => <option key={option.label} value={i}>{option.label}</option>)}
              </select>
            ))}
            {filtering && (
              <button type="button" onClick={() => { setSearch(''); setChosen(filters.map(() => -1)); }} className="text-sm text-gray-600 hover:text-gray-900">
                Clear
              </button>
            )}
            <span className="ml-auto text-xs text-gray-500">
              {filtering ? `${shown.length} of ${rows.length}` : `${rows.length} row${rows.length === 1 ? '' : 's'}`} · click a heading to sort
            </span>
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="px-6 py-12 text-center text-gray-500">{rows.length === 0 ? emptyText : 'Nothing matches the search or filter'}</p>
      ) : (
        <div className="overflow-auto max-h-[70vh]">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {columns.map((column) => {
                  const active = sort?.key === column.key;
                  const Icon = !active ? ChevronUpDownIcon : sort!.direction === 'asc' ? ChevronUpIcon : ChevronDownIcon;
                  return (
                    <th
                      key={column.key}
                      onClick={() => requestSort(column)}
                      aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={`px-6 py-3 text-xs font-medium uppercase cursor-pointer select-none hover:bg-gray-100 ${column.align === 'right' ? 'text-right' : 'text-left'} ${active ? 'text-indigo-700' : 'text-gray-500'}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {column.header}
                        <Icon className={`h-4 w-4 ${active ? 'text-indigo-600' : 'text-gray-300'}`} aria-hidden="true" />
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {shown.map((row, index) => (
                <tr key={rowKey(row, index)} className="hover:bg-indigo-50/30">
                  {columns.map((column) => {
                    const extra = typeof column.className === 'function' ? column.className(row) : column.className ?? 'text-gray-900';
                    return (
                      <td key={column.key} className={`px-6 py-4 text-sm ${column.align === 'right' ? 'text-right whitespace-nowrap' : ''} ${extra}`}>
                        {column.cell ? column.cell(row) : column.value(row) ?? '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {footer && <tfoot className="bg-gray-100 text-sm font-semibold text-gray-900 sticky bottom-0">{footer(shown)}</tfoot>}
          </table>
        </div>
      )}
    </div>
  );
}
