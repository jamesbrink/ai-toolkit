import { useState, useMemo } from 'react';
import { TableSkeleton } from '@/components/Skeleton';
import clsx from 'clsx';

export interface TableColumn<T = Record<string, unknown>> {
  title: string;
  key: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T = Record<string, unknown>> {
  columns: TableColumn<T>[];
  rows: T[];
  isLoading: boolean;
  theadClassName?: string;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  onRefresh: () => void;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  rowKey?: (row: T) => string;
  bulkActions?: React.ReactNode;
}

export default function UniversalTable<T>({
  columns,
  rows,
  isLoading,
  theadClassName = 'text-zinc-600 dark:text-zinc-400',
  defaultSortKey,
  defaultSortDir = 'asc',
  onRefresh = () => {},
  selectable = false,
  selectedKeys,
  onSelectionChange,
  rowKey,
  bulkActions,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      let cmp: number;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      } else {
        cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const SortIndicator = ({ columnKey }: { columnKey: string }) => {
    if (sortKey !== columnKey) return <span className="ml-1 text-zinc-400 dark:text-zinc-500">&#x21D5;</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>;
  };

  const allKeys = useMemo(() => {
    if (!selectable || !rowKey) return new Set<string>();
    return new Set(sortedRows.map(r => rowKey(r)));
  }, [selectable, rowKey, sortedRows]);

  const allSelected = selectable && selectedKeys ? selectedKeys.size > 0 && selectedKeys.size >= allKeys.size : false;
  const someSelected = selectable && selectedKeys ? selectedKeys.size > 0 && !allSelected : false;

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(allKeys));
    }
  };

  const toggleRow = (key: string) => {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  };

  const getCellValue = (row: T, key: string): React.ReactNode => {
    const val = (row as Record<string, unknown>)[key];
    if (val == null) return '';
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
    return '';
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-900 rounded-md shadow-md">
      {isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-zinc-600 dark:text-zinc-400">
          <p className="text-sm">Empty</p>
          <button
            onClick={() => onRefresh()}
            className="mt-2 px-3 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded transition-colors"
          >
            Refresh
          </button>
        </div>
      ) : (
        <>
          {/* Bulk actions bar */}
          {selectable && selectedKeys && selectedKeys.size > 0 && bulkActions && (
            <div className="flex items-center gap-3 border-b border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-2">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{selectedKeys.size} selected</span>
              {bulkActions}
              <button
                onClick={() => onSelectionChange?.(new Set())}
                className="text-xs px-3 py-1 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded"
              >
                Clear
              </button>
            </div>
          )}
          {/* Mobile card view */}
          <div className="sm:hidden divide-y divide-zinc-200 dark:divide-zinc-700">
            {sortedRows?.map((row, index) => {
              const key = selectable && rowKey ? rowKey(row) : String(index);
              const isSelected = selectable && selectedKeys?.has(key);
              return (
                <div key={key} className="p-3 space-y-2 relative">
                  {selectable && rowKey && (
                    <div className="absolute top-3 right-3">
                      <input
                        type="checkbox"
                        checked={!!isSelected}
                        onChange={() => toggleRow(key)}
                        className="accent-blue-500 rounded w-4 h-4"
                      />
                    </div>
                  )}
                  {columns.map(column => (
                    <div key={column.key} className="flex justify-between items-start gap-2">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400 uppercase shrink-0">
                        {column.title}
                      </span>
                      <span className={clsx('text-sm text-right', column.className)}>
                        {column.render ? column.render(row) : getCellValue(row, column.key)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {/* Desktop table view */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm text-left text-zinc-700 dark:text-zinc-300">
              <thead className={clsx('text-xs uppercase bg-zinc-50 dark:bg-zinc-800', theadClassName)}>
                <tr>
                  {selectable && rowKey && (
                    <th className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={toggleAll}
                        className="accent-blue-500 rounded w-4 h-4"
                      />
                    </th>
                  )}
                  {columns.map(column => (
                    <th key={column.key} className={clsx('px-3 py-2', column.className)}>
                      {column.sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-center cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                          onClick={() => handleSort(column.key)}
                        >
                          {column.title}
                          <SortIndicator columnKey={column.key} />
                        </button>
                      ) : (
                        <span className="inline-flex items-center">{column.title}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows?.map((row, index) => {
                  const key = selectable && rowKey ? rowKey(row) : String(index);
                  const isSelected = selectable && selectedKeys?.has(key);
                  const rowClass = index % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-800';

                  return (
                    <tr
                      key={key}
                      className={clsx(
                        `${rowClass} border-b border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700`,
                        isSelected && 'bg-blue-50 dark:bg-blue-900/20',
                      )}
                    >
                      {selectable && rowKey && (
                        <td className="px-3 py-2 w-10">
                          <input
                            type="checkbox"
                            checked={!!isSelected}
                            onChange={() => toggleRow(key)}
                            className="accent-blue-500 rounded w-4 h-4"
                          />
                        </td>
                      )}
                      {columns.map(column => (
                        <td key={column.key} className={clsx('px-3 py-2', column.className)}>
                          {column.render ? column.render(row) : getCellValue(row, column.key)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
