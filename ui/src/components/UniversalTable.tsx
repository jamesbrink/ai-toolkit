import { TableSkeleton } from '@/components/Skeleton';
import classNames from 'classnames';

export interface TableColumn {
  title: string;
  key: string;
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
  onRefresh: () => void;
}

export default function UniversalTable({
  columns,
  rows,
  isLoading,
  theadClassName = 'text-gray-400',
  onRefresh = () => {},
}: TableProps) {
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
            {rows?.map((row, index) => (
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
                    <th key={column.key} className="px-3 py-2">
                      {column.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows?.map((row, index) => {
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
