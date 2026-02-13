'use client';

import Link from 'next/link';
import { Server, Cpu, Monitor } from 'lucide-react';
import clsx from 'clsx';

interface HostSummaryCardProps {
  id: string;
  name: string;
  isOnline: boolean;
  deviceType: string;
  activeJobs: number;
}

export default function HostSummaryCard({ id, name, isOnline, deviceType, activeJobs }: HostSummaryCardProps) {
  const DeviceIcon = deviceType === 'mps' ? Monitor : deviceType === 'nvidia' ? Cpu : Server;

  return (
    <Link
      href={`/hosts/${id}`}
      className="block bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 hover:shadow-lg transition-all duration-200"
    >
      <div className="flex items-center space-x-3">
        <DeviceIcon className="w-5 h-5 text-zinc-500 dark:text-zinc-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{name}</span>
            <span className={clsx('w-2 h-2 rounded-full shrink-0', isOnline ? 'bg-green-500' : 'bg-red-500')} />
          </div>
          <div className="flex items-center space-x-2 mt-0.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{deviceType.toUpperCase()}</span>
            {activeJobs > 0 && (
              <span className="text-xs text-blue-600 dark:text-blue-400">
                {activeJobs} active job{activeJobs !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
