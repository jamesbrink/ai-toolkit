'use client';

import { useState, use, useEffect } from 'react';
import { FaChevronLeft } from 'react-icons/fa';
import { Button } from '@/components/catalyst/button';
import { Badge } from '@/components/catalyst/badge';
import { Heading } from '@/components/catalyst/heading';
import { TopBar, MainContent } from '@/components/layout';
import useJob from '@/hooks/useJob';
import SampleImages, { SampleImagesMenu } from '@/components/SampleImages';
import JobOverview from '@/components/JobOverview';
import { redirect, useSearchParams } from 'next/navigation';
import JobActionBar from '@/components/JobActionBar';
import JobConfigViewer from '@/components/JobConfigViewer';
import JobLossGraph from '@/components/JobLossGraph';
import { JobOverviewSkeleton } from '@/components/Skeleton';
import { Job } from '@/server/prismaTypes';
import { UnifiedJob } from '@/types';
import { useClaudeChat } from '@/components/claude/ClaudeChatContext';
import { configTools } from '@/components/claude/tools/configTools';
import { setNestedValue } from '@/utils/basic';
import { apiClient } from '@/utils/api';

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

export default function JobPage({ params }: { params: Promise<{ jobID: string }> }) {
  const { jobID } = use(params);
  const searchParams = useSearchParams();
  const hostId = searchParams.get('hostId');
  const { job, status, refreshJob } = useJob(jobID, 5000, hostId);
  const [pageKey, setPageKey] = useState<PageKey>('overview');
  const { setContext, setTools, isConfigured } = useClaudeChat();

  // Provide config tools to Claude chat
  useEffect(() => {
    if (isConfigured) {
      setTools(configTools);
      return () => setTools([]);
    }
  }, [isConfigured, setTools]);

  useEffect(() => {
    if (isConfigured && job) {
      let jobConfig: unknown = undefined;
      try {
        jobConfig = JSON.parse(job.job_config);
      } catch {
        // invalid config JSON
      }
      setContext({
        page: `/jobs/${jobID}`,
        jobData: { name: job.name, status: job.status, step: job.step, gpu_ids: job.gpu_ids },
        ...(jobConfig ? { jobConfig } : {}),
        ...(hostId ? { hostId } : {}),
      });
    }
  }, [isConfigured, job, jobID, setContext, hostId]);

  // Apply config changes from Claude's ConfigProposal
  useEffect(() => {
    const handler = async (e: Event) => {
      if (!job) return;
      const { path, value } = (e as CustomEvent).detail;
      try {
        const parsed = JSON.parse(job.job_config);
        const updated = setNestedValue(parsed, value, path);
        await apiClient.post('/api/jobs', {
          id: job.id,
          name: job.name,
          gpu_ids: job.gpu_ids,
          job_config: updated,
        });
        refreshJob();
      } catch (err) {
        console.error('Failed to apply config change:', err);
      }
    };
    window.addEventListener('claude-config-change', handler);
    return () => window.removeEventListener('claude-config-change', handler);
  }, [job, refreshJob]);

  const page = pages.find(p => p.value === pageKey);

  return (
    <>
      {/* Fixed top bar */}
      <TopBar>
        <div>
          <Button plain onClick={() => redirect('/jobs')}>
            <FaChevronLeft />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Heading level={1} className="text-lg">
            Job: {job?.name}
          </Heading>
          {hostId && <Badge color="blue">Remote</Badge>}
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
      <div className="bg-zinc-100 dark:bg-zinc-800 absolute top-12 left-0 w-full h-10 flex items-center px-2 text-sm overflow-x-auto">
        {pages.map(page => (
          <Button
            key={page.value}
            plain
            onClick={() => setPageKey(page.value)}
            className={`px-4 py-2 h-10 whitespace-nowrap shrink-0 ${page.value === pageKey ? 'bg-zinc-200 dark:bg-zinc-700' : ''}`}
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
