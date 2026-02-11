'use client';

import { useRouter } from 'next/navigation';
import { Server, Cpu, Monitor } from 'lucide-react';
import classNames from 'classnames';

interface HostSummaryCardProps {
  id: string;
  name: string;
  isOnline: boolean;
  deviceType: string;
  activeJobs: number;
}

export default function HostSummaryCard({ id, name, isOnline, deviceType, activeJobs }: HostSummaryCardProps) {
  const router = useRouter();

  const DeviceIcon = deviceType === 'mps' ? Monitor : deviceType === 'nvidia' ? Cpu : Server;

  return (
    <div
      onClick={() => router.push(`/hosts/${id}`)}
      className="bg-gray-900 rounded-xl border border-gray-800 p-3 hover:shadow-lg transition-all duration-200 cursor-pointer"
    >
      <div className="flex items-center space-x-3">
        <DeviceIcon className="w-5 h-5 text-gray-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-100 truncate">{name}</span>
            <span className={classNames('w-2 h-2 rounded-full shrink-0', isOnline ? 'bg-green-500' : 'bg-red-500')} />
          </div>
          <div className="flex items-center space-x-2 mt-0.5">
            <span className="text-xs text-gray-400">{deviceType.toUpperCase()}</span>
            {activeJobs > 0 && (
              <span className="text-xs text-blue-400">
                {activeJobs} active job{activeJobs !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
