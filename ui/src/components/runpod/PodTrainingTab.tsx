'use client';

import { useMemo } from 'react';
import { RemoteJob } from '@/hooks/useRemoteJobs';
import { UnifiedJob } from '@/types';
import JobLossGraph from '@/components/JobLossGraph';
import SampleImages from '@/components/SampleImages';
import { Loader2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

interface PodTrainingTabProps {
  hostId: string | null;
  activeJob: RemoteJob | null;
  remoteJobsStatus: 'idle' | 'loading' | 'success' | 'error';
  onRetryRemoteJobs: () => void;
}

function EmptyState({ icon, message, action }: { icon: React.ReactNode; message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-zinc-600 dark:text-zinc-400">
      <div className="mb-3">{icon}</div>
      <p className="text-sm">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Adapt a RemoteJob to the UnifiedJob shape expected by JobLossGraph/SampleImages */
function toUnifiedJob(job: RemoteJob): UnifiedJob {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    step: job.step,
    speed_string: job.speed_string,
    gpu_ids: job.gpu_ids,
    job_config: job.job_config,
    queue_position: job.queue_position,
    created_at: job.created_at,
    info: job.info,
    stop: job.stop,
    return_to_queue: job.return_to_queue,
    source: { type: 'remote' },
  };
}

export default function PodTrainingTab({
  hostId,
  activeJob,
  remoteJobsStatus,
  onRetryRemoteJobs,
}: PodTrainingTabProps) {
  const adaptedJob = useMemo(() => (activeJob ? toUnifiedJob(activeJob) : null), [activeJob]);

  if (!hostId) {
    return (
      <EmptyState
        icon={<Loader2 className="w-6 h-6 animate-spin text-zinc-500" />}
        message="Waiting for pod to come online..."
      />
    );
  }

  if (remoteJobsStatus === 'loading') {
    return (
      <EmptyState
        icon={<Loader2 className="w-6 h-6 animate-spin text-zinc-500" />}
        message="Connecting to remote instance..."
      />
    );
  }

  if (remoteJobsStatus === 'error') {
    return (
      <EmptyState
        icon={<RefreshCw className="w-6 h-6 text-zinc-500" />}
        message="Could not connect to remote instance"
        action={
          <button
            onClick={onRetryRemoteJobs}
            className="px-3 py-1.5 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-lg text-sm transition-colors"
          >
            Retry
          </button>
        }
      />
    );
  }

  if (!activeJob || !adaptedJob) {
    return (
      <EmptyState icon={<span className="text-2xl">&#x1f4ad;</span>} message="No training jobs running on this pod" />
    );
  }

  const statusColors: Record<string, string> = {
    running: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    queued: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    stopped: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',
  };

  return (
    <div className="space-y-6">
      {/* Job Status Header */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{activeJob.name}</span>
            <span
              className={clsx(
                'px-2 py-0.5 rounded-full text-xs',
                statusColors[activeJob.status] || 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',
              )}
            >
              {activeJob.status}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            <span>Step {activeJob.step}</span>
            {activeJob.speed_string && <span>{activeJob.speed_string}</span>}
          </div>
        </div>
      </div>

      {/* Loss Chart */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">Loss Graph</h3>
        <JobLossGraph job={adaptedJob} hostId={hostId} />
      </div>

      {/* Sample Images */}
      <div>
        <SampleImages job={adaptedJob} hostId={hostId} />
      </div>
    </div>
  );
}
