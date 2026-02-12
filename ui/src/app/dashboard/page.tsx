'use client';

import GpuMonitor from '@/components/GPUMonitor';
import JobsTable from '@/components/JobsTable';
import { TopBar, MainContent } from '@/components/layout';
import useHostList from '@/hooks/useHostList';
import Link from 'next/link';

export default function Dashboard() {
  const { hosts } = useHostList();
  const onlineHosts = hosts.filter(h => h.isOnline);
  const hasHosts = hosts.length > 0;

  return (
    <>
      <TopBar>
        <div>
          <h1 className="text-lg">Dashboard</h1>
        </div>
        <div className="flex-1"></div>
        {onlineHosts.length > 0 && (
          <span className="text-xs text-gray-400">
            {onlineHosts.length} remote host{onlineHosts.length !== 1 ? 's' : ''} connected
          </span>
        )}
      </TopBar>
      <MainContent>
        <GpuMonitor hosts={hasHosts ? hosts : undefined} />
        <div className="w-full mt-4">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-md">Queues</h1>
            <div className="text-xs text-gray-400">
              <Link href="/jobs">View All</Link>
            </div>
          </div>
          <JobsTable onlyActive hosts={hasHosts ? hosts : undefined} />
        </div>
      </MainContent>
    </>
  );
}
