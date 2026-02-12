import { useState, useMemo } from 'react';
import { TableSkeleton } from '@/components/Skeleton';
import classNames from 'classnames';

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
}

export default function UniversalTable<T>({
  columns,
  rows,
  isLoading,
  theadClassName = 'text-gray-400',
  defaultSortKey,
  defaultSortDir = 'asc',
  onRefresh = () => {},
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
    if (sortKey !== columnKey) return <span className="ml-1 text-gray-600">↕</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  /** Get a cell value for default (non-render) display */
  const getCellValue = (row: T, key: string): React.ReactNode => {
    const val = (row as Record<string, unknown>)[key];
    if (val == null) return '';
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
    return '';
  };

  return (
    <div className="w-full bg-gray-900 rounded-md shadow-md">
      {isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-gray-400">
          <p className="text-sm">Empty</p>
          <button
            onClick={() => onRefresh()}
            className="mt-2 px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          >
            Refresh
          </button>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden divide-y divide-gray-700">
            {sortedRows?.map((row, index) => (
              <div key={index} className="p-3 space-y-2">
                {columns.map(column => (
                  <div key={column.key} className="flex justify-between items-start gap-2">
                    <span className="text-xs text-gray-400 uppercase shrink-0">{column.title}</span>
                    <span className={classNames('text-sm text-right', column.className)}>
                      {column.render ? column.render(row) : getCellValue(row, column.key)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* Desktop table view */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className={classNames('text-xs uppercase bg-gray-800', theadClassName)}>
                <tr>
                  {columns.map(column => (
                    <th
                      key={column.key}
                      className={classNames('px-3 py-2', column.className)}
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-center cursor-pointer select-none hover:text-gray-200 transition-colors"
                          onClick={() => handleSort(column.key)}
                        >
                          {column.title}
                          <SortIndicator columnKey={column.key} />
                        </button>
                      ) : (
                        <span className="inline-flex items-center">
                          {column.title}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows?.map((row, index) => {
                  // Style for alternating rows
                  const rowClass = index % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800';

                  return (
                    <tr key={index} className={`${rowClass} border-b border-gray-700 hover:bg-gray-700`}>
                      {columns.map(column => (
                        <td key={column.key} className={classNames('px-3 py-2', column.className)}>
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
