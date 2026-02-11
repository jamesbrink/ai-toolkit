import { useState, useMemo } from 'react';
import { TableSkeleton } from '@/components/Skeleton';
import classNames from 'classnames';

export interface TableColumn {
  title: string;
  key: string;
  sortable?: boolean;
  render?: (row: any) => React.ReactNode;
  className?: string;
}

interface TableRow {
  [key: string]: any;
}

interface TableProps {
  columns: TableColumn[];
  rows: TableRow[];
  isLoading: boolean;
  theadClassName?: string;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  onRefresh: () => void;
}

export default function UniversalTable({
  columns,
  rows,
  isLoading,
  theadClassName = 'text-gray-400',
  defaultSortKey,
  defaultSortDir = 'asc',
  onRefresh = () => {},
}: TableProps) {
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
      const aVal = a[sortKey];
      const bVal = b[sortKey];
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
                      {column.render ? column.render(row) : row[column.key]}
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
                      className={classNames(
                        'px-3 py-2',
                        column.className,
                        column.sortable && 'cursor-pointer select-none hover:text-gray-200 transition-colors',
                      )}
                      onClick={column.sortable ? () => handleSort(column.key) : undefined}
                    >
                      <span className="inline-flex items-center">
                        {column.title}
                        {column.sortable && <SortIndicator columnKey={column.key} />}
                      </span>
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
                          {column.render ? column.render(row) : row[column.key]}
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
