import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circle' | 'rect' | 'card';
  width?: string;
  height?: string;
}

export function Skeleton({ className, variant = 'rect', width, height }: SkeletonProps) {
  return (
    <div
      className={clsx(
        'animate-shimmer',
        {
          'h-4 rounded': variant === 'text',
          'rounded-full': variant === 'circle',
          rounded: variant === 'rect',
          'rounded-lg': variant === 'card',
        },
        className,
      )}
      style={{ width, height }}
    />
  );
}

export function GPUWidgetSkeleton() {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" className="w-8 h-8" />
        <Skeleton variant="text" className="w-32" />
      </div>
      <Skeleton variant="rect" className="w-full h-2" />
      <div className="flex justify-between">
        <Skeleton variant="text" className="w-16 h-3" />
        <Skeleton variant="text" className="w-16 h-3" />
      </div>
      <Skeleton variant="rect" className="w-full h-2" />
      <div className="flex justify-between">
        <Skeleton variant="text" className="w-20 h-3" />
        <Skeleton variant="text" className="w-12 h-3" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full bg-gray-900 rounded-md shadow-md">
      <div className="bg-gray-800 px-3 py-2 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} variant="text" className="flex-1 h-3" />
        ))}
      </div>
      <div className="divide-y divide-gray-700">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-3 py-3 flex gap-4">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} variant="text" className="flex-1 h-3" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function JobOverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <div className="md:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="w-48 h-5" />
          <Skeleton variant="rect" className="w-20 h-6 rounded-full" />
        </div>
        <Skeleton variant="rect" className="w-full h-2" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton variant="circle" className="w-5 h-5" />
              <div className="space-y-1 flex-1">
                <Skeleton variant="text" className="w-16 h-3" />
                <Skeleton variant="text" className="w-24 h-3" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton variant="rect" className="w-full h-40" />
      </div>
      <div className="md:col-span-1 space-y-4">
        <GPUWidgetSkeleton />
        <GPUWidgetSkeleton />
      </div>
    </div>
  );
}
