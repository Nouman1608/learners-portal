import React, { useMemo, useState } from 'react';
import { ChevronUpIcon, ChevronDownIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig<T> {
  key: keyof T | string;
  direction: SortDirection;
}

export function useSortableData<T>(
  items: T[],
  config: SortConfig<T> | null = null
) {
  const [sortConfig, setSortConfig] = useState<SortConfig<T> | null>(config);

  const sortedItems = useMemo(() => {
    const sortableItems = [...items];
    if (sortConfig !== null && sortConfig.direction !== null) {
      sortableItems.sort((a, b) => {
        // Handle nested keys (e.g., "user.firstName")
        const getNestedValue = (obj: any, path: string) => {
          return path.split('.').reduce((acc, part) => acc?.[part], obj);
        };

        const aValue = getNestedValue(a, sortConfig.key as string);
        const bValue = getNestedValue(b, sortConfig.key as string);

        // Handle null/undefined values
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return 1;
        if (bValue == null) return -1;

        // Handle different data types
        let comparison = 0;

        // Numbers
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        }
        // Dates
        else if (aValue instanceof Date && bValue instanceof Date) {
          comparison = aValue.getTime() - bValue.getTime();
        }
        // Date strings (ISO format)
        else if (typeof aValue === 'string' && typeof bValue === 'string') {
          const aDate = new Date(aValue);
          const bDate = new Date(bValue);
          if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
            comparison = aDate.getTime() - bDate.getTime();
          } else {
            // String comparison
            comparison = aValue.toLowerCase().localeCompare(bValue.toLowerCase());
          }
        }
        // Boolean
        else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          comparison = aValue === bValue ? 0 : aValue ? 1 : -1;
        }
        // Fallback to string comparison
        else {
          comparison = String(aValue).toLowerCase().localeCompare(String(bValue).toLowerCase());
        }

        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }
    return sortableItems;
  }, [items, sortConfig]);

  const requestSort = (key: keyof T | string) => {
    let direction: SortDirection = 'asc';
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === 'asc'
    ) {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (columnKey: keyof T | string): React.ReactNode => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <ChevronUpDownIcon className="inline h-3.5 w-3.5 ml-0.5 text-gray-400" />;
    }
    return sortConfig.direction === 'asc'
      ? <ChevronUpIcon className="inline h-3.5 w-3.5 ml-0.5 text-indigo-500" />
      : <ChevronDownIcon className="inline h-3.5 w-3.5 ml-0.5 text-indigo-500" />;
  };

  return { items: sortedItems, requestSort, sortConfig, getSortIndicator };
}
