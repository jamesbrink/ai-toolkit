'use client';

import GpuMonitor from '@/components/GPUMonitor';
import JobsTable from '@/components/JobsTable';
import { TopBar, MainContent } from '@/components/layout';
import HostSummaryCard from '@/components/HostSummaryCard';
import useHostList from '@/hooks/useHostList';
import Link from 'next/link';

export default function Dashboard() {
  const { hosts } = useHostList();

  return (
    <>
      <TopBar>
        <div>
          <h1 className="text-lg">Dashboard</h1>
        </div>
        <div className="flex-1"></div>
      </TopBar>
      <MainContent>
        <GpuMonitor />
        <div className="w-full mt-4">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-md">Queues</h1>
            <div className="text-xs text-gray-400">
              <Link href="/jobs">View All</Link>
            </div>
          </div>
          <JobsTable onlyActive />
        </div>
        {hosts.length > 0 && (
          <div className="w-full mt-4">
            <div className="flex justify-between items-center mb-2">
              <h1 className="text-md">Network</h1>
              <div className="text-xs text-gray-400">
                <Link href="/hosts">View All</Link>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {hosts.map(host => (
                <HostSummaryCard
                  key={host.id}
                  id={host.id}
                  name={host.name}
                  isOnline={host.isOnline}
                  deviceType={host.deviceType}
                  activeJobs={0}
                />
              ))}
            </div>
          </div>
        )}
      </MainContent>
    </>
  );
}
