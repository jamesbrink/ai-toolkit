'use client';

import { useState, use, useEffect } from 'react';
import { FaChevronLeft } from 'react-icons/fa';
import { Button } from '@headlessui/react';
import { TopBar, MainContent } from '@/components/layout';
import useJob from '@/hooks/useJob';
import SampleImages, { SampleImagesMenu } from '@/components/SampleImages';
import JobOverview from '@/components/JobOverview';
import { redirect, useSearchParams } from 'next/navigation';
import JobActionBar from '@/components/JobActionBar';
import JobConfigViewer from '@/components/JobConfigViewer';
import JobLossGraph from '@/components/JobLossGraph';
import { JobOverviewSkeleton } from '@/components/Skeleton';
import { Job } from '@prisma/client';
import { UnifiedJob } from '@/types';
import { useClaudeChat } from '@/components/claude/ClaudeChatContext';

type PageKey = 'overview' | 'samples' | 'config' | 'loss_log';

interface Page {
  name: string;
  value: PageKey;
  component: React.ComponentType<{ job: Job | UnifiedJob; hostId?: string | null }>;
  menuItem?: React.ComponentType<{ job?: Job | UnifiedJob | null; hostId?: string | null }> | null;
  mainCss?: string;
}

const pages: Page[] = [
  {
    name: 'Overview',
    value: 'overview',
    component: JobOverview,
    mainCss: 'pt-24',
  },
  {
    name: 'Samples',
    value: 'samples',
    component: SampleImages,
    menuItem: SampleImagesMenu,
    mainCss: 'pt-24',
  },
  {
    name: 'Loss Graph',
    value: 'loss_log',
    component: JobLossGraph,
    mainCss: 'pt-24',
  },
  {
    name: 'Config File',
    value: 'config',
    component: JobConfigViewer,
    mainCss: 'pt-[80px] px-0 pb-0',
  },
];

export default function JobPage({ params }: { params: { jobID: string } }) {
  const usableParams = use(params as any) as { jobID: string };
  const jobID = usableParams.jobID;
  const searchParams = useSearchParams();
  const hostId = searchParams.get('hostId');
  const { job, status, refreshJob } = useJob(jobID, 5000, hostId);
  const [pageKey, setPageKey] = useState<PageKey>('overview');
  const { setContext, isConfigured } = useClaudeChat();

  useEffect(() => {
    if (isConfigured && job) {
      setContext({
        page: `/jobs/${jobID}`,
        jobData: { name: job.name, status: job.status, step: job.step, gpu_ids: job.gpu_ids },
      });
    }
  }, [isConfigured, job, jobID, setContext]);

  const page = pages.find(p => p.value === pageKey);

  return (
    <>
      {/* Fixed top bar */}
      <TopBar>
        <div>
          <Button className="text-gray-300 px-3 mt-1" onClick={() => redirect('/jobs')}>
            <FaChevronLeft />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg">Job: {job?.name}</h1>
          {hostId && (
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full font-medium">Remote</span>
          )}
        </div>
        <div className="flex-1"></div>
        {job && (
          <JobActionBar
            job={job}
            source={hostId ? { type: 'remote', hostId } : undefined}
            onRefresh={refreshJob}
            hideView
            afterDelete={() => {
              redirect('/jobs');
            }}
            autoStartQueue={true}
          />
        )}
      </TopBar>
      <MainContent className={pages.find(page => page.value === pageKey)?.mainCss}>
        {status === 'loading' && job == null && <JobOverviewSkeleton />}
        {status === 'error' && job == null && <p>Error fetching job</p>}
        {job && (
          <>
            {pages.map(page => {
              const Component = page.component;
              return page.value === pageKey ? <Component key={page.value} job={job} hostId={hostId} /> : null;
            })}
          </>
        )}
      </MainContent>
      <div className="bg-gray-800 absolute top-12 left-0 w-full h-10 flex items-center px-2 text-sm overflow-x-auto">
        {pages.map(page => (
          <Button
            key={page.value}
            onClick={() => setPageKey(page.value)}
            className={`px-4 py-2 h-10 whitespace-nowrap shrink-0 ${page.value === pageKey ? 'bg-gray-300 dark:bg-gray-700' : ''}`}
          >
            {page.name}
          </Button>
        ))}
        {page?.menuItem && (
          <>
            <div className="flex-grow"></div>
            <page.menuItem job={job} hostId={hostId} />
          </>
        )}
      </div>
    </>
  );
}
