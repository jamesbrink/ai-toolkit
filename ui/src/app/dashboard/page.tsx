'use client';

import GpuMonitor from '@/components/GPUMonitor';
import JobsTable from '@/components/JobsTable';
import { TopBar, MainContent } from '@/components/layout';
import { Heading, Subheading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { TextLink } from '@/components/catalyst/text';
import useHostList from '@/hooks/useHostList';

export default function Dashboard() {
  const { hosts } = useHostList();
  const onlineHosts = hosts.filter(h => h.isOnline);
  const hasHosts = hosts.length > 0;

  return (
    <>
      <TopBar>
        <div>
          <Heading level={1} className="text-lg">
            Dashboard
          </Heading>
        </div>
        <div className="flex-1"></div>
        {onlineHosts.length > 0 && (
          <Text className="text-xs">
            {onlineHosts.length} remote host{onlineHosts.length !== 1 ? 's' : ''} connected
          </Text>
        )}
      </TopBar>
      <MainContent>
        <GpuMonitor hosts={hasHosts ? hosts : undefined} />
        <div className="w-full mt-4">
          <div className="flex justify-between items-center mb-2">
            <Subheading level={2}>Queues</Subheading>
            <TextLink href="/jobs" className="text-xs">
              View All
            </TextLink>
          </div>
          <JobsTable onlyActive hosts={hasHosts ? hosts : undefined} />
        </div>
      </MainContent>
    </>
  );
}
