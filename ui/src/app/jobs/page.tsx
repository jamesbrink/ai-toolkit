'use client';

import JobsTable from '@/components/JobsTable';
import { TopBar, MainContent } from '@/components/layout';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Button } from '@/components/catalyst/button';
import useHostList from '@/hooks/useHostList';

export default function Dashboard() {
  const { hosts } = useHostList();
  const onlineHosts = hosts.filter(h => h.isOnline);

  return (
    <>
      <TopBar>
        <div>
          <Heading level={1} className="text-lg">
            Jobs
          </Heading>
        </div>
        <div className="flex-1"></div>
        {onlineHosts.length > 0 && (
          <Text className="text-xs mr-3">
            {onlineHosts.length} remote host{onlineHosts.length !== 1 ? 's' : ''} connected
          </Text>
        )}
        <div>
          <Button color="blue" href="/jobs/new">
            New Training Job
          </Button>
        </div>
      </TopBar>
      <MainContent>
        <JobsTable hosts={hosts.length > 0 ? hosts : undefined} />
      </MainContent>
    </>
  );
}
