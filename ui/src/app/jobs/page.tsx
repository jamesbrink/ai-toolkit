'use client';

import JobsTable from '@/components/JobsTable';
import { TopBar, MainContent } from '@/components/layout';
import Link from 'next/link';
import useHostList from '@/hooks/useHostList';

export default function Dashboard() {
  const { hosts } = useHostList();
  const onlineHosts = hosts.filter(h => h.isOnline);

  return (
    <>
      <TopBar>
        <div>
          <h1 className="text-lg">Jobs</h1>
        </div>
        <div className="flex-1"></div>
        {onlineHosts.length > 0 && (
          <span className="text-xs text-gray-400 mr-3">
            {onlineHosts.length} remote host{onlineHosts.length !== 1 ? 's' : ''} connected
          </span>
        )}
        <div>
          <Link href="/jobs/new" className="text-gray-200 bg-slate-600 px-3 py-1 rounded-md">
            New Training Job
          </Link>
        </div>
      </TopBar>
      <MainContent>
        <JobsTable hosts={hosts.length > 0 ? hosts : undefined} />
      </MainContent>
    </>
  );
}
