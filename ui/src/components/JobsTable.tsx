import { useMemo } from 'react';
import useJobsList from '@/hooks/useJobsList';
import useAllJobs from '@/hooks/useAllJobs';
import useAllQueues from '@/hooks/useAllQueues';
import useAllGPUInfo from '@/hooks/useAllGPUInfo';
import Link from 'next/link';
import UniversalTable, { TableColumn } from '@/components/UniversalTable';
import { GpuInfo, JobConfig, UnifiedJob, UnifiedQueue, DataSource } from '@/types';
import JobActionBar from './JobActionBar';
import { Job, Queue } from '@/server/prismaTypes';
import useQueueList from '@/hooks/useQueueList';
import clsx from 'clsx';
import { startQueue, stopQueue } from '@/utils/queue';
import { startQueueOnHost, stopQueueOnHost } from '@/utils/remoteActions';
import { CgSpinner } from 'react-icons/cg';
import useGPUInfo from '@/hooks/useGPUInfo';
import { HostInfo } from '@/hooks/useHostList';

interface JobsTableProps {
  autoStartQueue?: boolean;
  onlyActive?: boolean;
  hosts?: HostInfo[];
}

export default function JobsTable({ onlyActive = false, hosts }: JobsTableProps) {
  if (hosts) {
    return <MultiHostJobsTable onlyActive={onlyActive} hosts={hosts} />;
  }
  return <LocalJobsTable onlyActive={onlyActive} />;
}

// ─── Multi-Host Mode ───────────────────────────────────────────────

function MultiHostJobsTable({ onlyActive, hosts }: { onlyActive: boolean; hosts: HostInfo[] }) {
  const { allJobs, isLoading: jobsLoading, refreshAllJobs } = useAllJobs(hosts, onlyActive, 5000);
  const { allQueues, isLoading: queuesLoading, refreshAllQueues } = useAllQueues(hosts, 5000);
  const { allGpus, isLoading: gpusLoading } = useAllGPUInfo(hosts, 3000);

  const refresh = () => {
    refreshAllJobs();
    refreshAllQueues();
  };

  const columns: TableColumn<UnifiedJob>[] = [
    {
      title: 'Name',
      key: 'name',
      render: (row: UnifiedJob) => (
        <div className="flex items-center gap-2">
          {['running', 'stopping'].includes(row.status) ? (
            <CgSpinner className="inline animate-spin text-blue-400 flex-shrink-0" />
          ) : null}
          <span className="font-medium whitespace-nowrap">{row.name}</span>
          {row.source.type === 'remote' && (
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 rounded text-[10px] flex-shrink-0">
              {row.source.hostName}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Steps',
      key: 'steps',
      render: (row: UnifiedJob) => {
        const jobConfig: JobConfig = JSON.parse(row.job_config);
        const totalSteps = jobConfig.config.process[0].train.steps;
        return (
          <div>
            <div className="text-xs text-zinc-500 dark:text-gray-400">
              {row.step} / {totalSteps}
            </div>
            <div className="bg-zinc-200 dark:bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full"
                style={{ width: `${(row.step / totalSteps) * 100}%` }}
              ></div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'GPU',
      key: 'gpu_ids',
    },
    {
      title: 'Status',
      key: 'status',
      render: (row: UnifiedJob) => {
        let statusClass = 'text-zinc-500 dark:text-gray-400';
        if (row.status === 'completed') statusClass = 'text-green-600 dark:text-green-400';
        if (row.status === 'failed') statusClass = 'text-red-600 dark:text-red-400';
        if (row.status === 'running') statusClass = 'text-blue-600 dark:text-blue-400';
        return <span className={statusClass}>{row.status}</span>;
      },
    },
    {
      title: 'Info',
      key: 'info',
      className: 'truncate max-w-xs',
    },
    {
      title: 'Actions',
      key: 'actions',
      className: 'text-right',
      render: (row: UnifiedJob) => {
        return <JobActionBar job={row} source={row.source} onRefresh={refresh} autoStartQueue={false} />;
      },
    },
  ];

  // Build a grouping key: "${hostId}:${gpuKey}" for uniqueness across hosts
  const jobsDict = useMemo(() => {
    if (gpusLoading && allGpus.length === 0) return {};
    if (allJobs.length === 0 && allGpus.length === 0) return {};

    const jd: {
      [key: string]: {
        name: string;
        hostName?: string;
        source: DataSource;
        jobs: UnifiedJob[];
      };
    } = {};

    // Create a slot for each GPU from each host
    for (const gpu of allGpus) {
      const hostKey = gpu.source.hostId || 'local';
      const gpuKey = gpu.isMps ? 'mps' : `${gpu.index}`;
      const compositeKey = `${hostKey}:${gpuKey}`;
      const prefix = gpu.source.type === 'remote' ? `${gpu.source.hostName} — ` : '';
      jd[compositeKey] = {
        name: `${prefix}${gpu.name}`,
        hostName: gpu.source.hostName,
        source: gpu.source,
        jobs: [],
      };
    }

    jd['Idle'] = { name: 'Idle', source: { type: 'local' }, jobs: [] };

    // Place each job into the right GPU group
    for (const job of allJobs) {
      const hostKey = job.source.hostId || 'local';
      let gpuKey: string;
      if (job.gpu_ids === 'mps') {
        gpuKey = 'mps';
      } else {
        // Find matching GPU from same host
        const matchGpu = allGpus.find(
          g => (g.source.hostId || 'local') === hostKey && job.gpu_ids?.split(',').includes(g.index.toString()),
        );
        gpuKey = matchGpu ? `${matchGpu.index}` : '0';
      }
      const compositeKey = `${hostKey}:${gpuKey}`;

      if (['queued', 'running', 'stopping'].includes(job.status) && compositeKey in jd) {
        jd[compositeKey].jobs.push(job);
      } else {
        jd['Idle'].jobs.push(job);
      }
    }

    // Sort active jobs by queue position
    for (const key of Object.keys(jd)) {
      if (key === 'Idle') continue;
      jd[key].jobs.sort((a, b) => {
        if (a.queue_position === null) return 1;
        if (b.queue_position === null) return -1;
        return a.queue_position - b.queue_position;
      });
    }

    return jd;
  }, [allJobs, allGpus, gpusLoading]);

  // Find matching queue for a composite key
  const findQueue = (compositeKey: string): UnifiedQueue | undefined => {
    const [hostPart, gpuKey] = compositeKey.split(':');
    return allQueues.find(q => (q.source.hostId || 'local') === hostPart && `${q.gpu_ids}` === gpuKey);
  };

  let isLoading = jobsLoading || queuesLoading || (gpusLoading && allGpus.length === 0);
  if (Object.keys(jobsDict).length > 0) isLoading = false;

  return (
    <div>
      {Object.keys(jobsDict)
        .sort()
        .filter(key => key !== 'Idle')
        .map(compositeKey => {
          const queue = findQueue(compositeKey);
          const group = jobsDict[compositeKey];
          const queueRunning = queue?.is_running ?? false;
          const [, gpuKey] = compositeKey.split(':');

          const handleStartQueue = async () => {
            if (group.source.type === 'remote' && group.source.hostId) {
              await startQueueOnHost(group.source, gpuKey);
            } else {
              await startQueue(gpuKey);
            }
            refresh();
          };

          const handleStopQueue = async () => {
            if (group.source.type === 'remote' && group.source.hostId) {
              await stopQueueOnHost(group.source, queue!.gpu_ids);
            } else {
              await stopQueue(queue!.gpu_ids);
            }
            refresh();
          };

          return (
            <div key={compositeKey} className="mb-6">
              <div
                className={clsx(
                  'text-md flex flex-col sm:flex-row px-4 py-1 rounded-t-lg',
                  queueRunning ? 'bg-emerald-50 dark:bg-green-900' : 'bg-red-50 dark:bg-red-900',
                )}
              >
                <div className="flex items-center space-x-2 flex-1 py-2">
                  <h2
                    className={clsx(
                      'font-semibold',
                      queueRunning ? 'text-emerald-900 dark:text-gray-100' : 'text-red-900 dark:text-gray-100',
                    )}
                  >
                    {group.name}
                  </h2>
                  <span
                    className={clsx(
                      'px-2 py-0.5 rounded-full text-xs',
                      queueRunning
                        ? 'bg-emerald-200 text-emerald-800 dark:bg-gray-700 dark:text-gray-300'
                        : 'bg-red-200 text-red-800 dark:bg-gray-700 dark:text-gray-300',
                    )}
                  >
                    {gpuKey === 'mps' ? 'MPS' : `# ${gpuKey}`}
                  </span>
                  {group.source.type === 'remote' && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 rounded-full text-xs">
                      {group.source.hostName}
                    </span>
                  )}
                </div>
                <div
                  className={clsx(
                    'text-sm italic flex items-center',
                    queueRunning ? 'text-emerald-700 dark:text-gray-300' : 'text-red-700 dark:text-gray-300',
                  )}
                >
                  {queueRunning ? (
                    <>
                      <span className="text-emerald-600 dark:text-green-400 mr-2">Queue Running</span>
                      <button
                        onClick={handleStopQueue}
                        className="ml-4 text-xs bg-red-600 hover:bg-red-700 dark:bg-red-900 dark:hover:bg-red-800 text-white px-2 py-1 rounded"
                      >
                        STOP
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-red-600 dark:text-red-400 mr-2">Queue Stopped</span>
                      <button
                        onClick={handleStartQueue}
                        className="ml-4 text-xs bg-emerald-600 hover:bg-emerald-700 dark:bg-green-700 dark:hover:bg-green-600 text-white px-2 py-1 rounded"
                      >
                        START
                      </button>
                    </>
                  )}
                </div>
              </div>
              <UniversalTable
                columns={columns}
                rows={group.jobs}
                isLoading={isLoading}
                onRefresh={refresh}
                theadClassName={queueRunning ? 'bg-emerald-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'}
              />
            </div>
          );
        })}
      {!onlyActive && Object.keys(jobsDict).includes('Idle') && jobsDict['Idle'].jobs.length > 0 && (
        <div className="mb-6 opacity-50">
          <div className="text-md flex px-4 py-1 rounded-t-lg bg-zinc-200 dark:bg-slate-600">
            <div className="flex items-center space-x-2 flex-1 py-2">
              <h2 className="font-semibold text-zinc-700 dark:text-gray-100">Idle</h2>
            </div>
          </div>
          <UniversalTable columns={columns} rows={jobsDict['Idle'].jobs} isLoading={isLoading} onRefresh={refresh} />
        </div>
      )}
    </div>
  );
}

// ─── Local-Only Mode (backward compat) ─────────────────────────────

function LocalJobsTable({ onlyActive }: { onlyActive: boolean }) {
  const { jobs, status, refreshJobs } = useJobsList(onlyActive, 5000);
  const { queues, status: queueStatus, refreshQueues } = useQueueList();
  const { gpuList, isGPUInfoLoaded } = useGPUInfo();

  const refresh = () => {
    refreshJobs();
    refreshQueues();
  };

  const columns: TableColumn<Job>[] = [
    {
      title: 'Name',
      key: 'name',
      render: row => (
        <Link href={`/jobs/${row.id}`} className="font-medium whitespace-nowrap">
          {['running', 'stopping'].includes(row.status) ? (
            <CgSpinner className="inline animate-spin mr-2 text-blue-400" />
          ) : null}
          {row.name}
        </Link>
      ),
    },
    {
      title: 'Steps',
      key: 'steps',
      render: row => {
        const jobConfig: JobConfig = JSON.parse(row.job_config);
        const totalSteps = jobConfig.config.process[0].train.steps;

        return (
          <div>
            <div className="text-xs text-zinc-500 dark:text-gray-400">
              {row.step} / {totalSteps}
            </div>
            <div className="bg-zinc-200 dark:bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full"
                style={{ width: `${(row.step / totalSteps) * 100}%` }}
              ></div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'GPU',
      key: 'gpu_ids',
    },
    {
      title: 'Status',
      key: 'status',
      render: row => {
        let statusClass = 'text-zinc-500 dark:text-gray-400';
        if (row.status === 'completed') statusClass = 'text-green-600 dark:text-green-400';
        if (row.status === 'failed') statusClass = 'text-red-600 dark:text-red-400';
        if (row.status === 'running') statusClass = 'text-blue-600 dark:text-blue-400';

        return <span className={statusClass}>{row.status}</span>;
      },
    },
    {
      title: 'Info',
      key: 'info',
      className: 'truncate max-w-xs',
    },
    {
      title: 'Actions',
      key: 'actions',
      className: 'text-right',
      render: row => {
        return <JobActionBar job={row} onRefresh={refreshJobs} autoStartQueue={false} />;
      },
    },
  ];

  const jobsDict = useMemo(() => {
    if (!isGPUInfoLoaded) return {};
    if (jobs.length === 0) return {};
    const jd: { [key: string]: { name: string; jobs: Job[] } } = {};
    gpuList.forEach(gpu => {
      const key = gpu.isMps ? 'mps' : `${gpu.index}`;
      jd[key] = { name: `${gpu.name}`, jobs: [] };
    });
    jd['Idle'] = { name: 'Idle', jobs: [] };
    jobs.forEach(job => {
      let key: string;
      if (job.gpu_ids === 'mps') {
        key = 'mps';
      } else {
        const gpu = gpuList.find(gpu => job.gpu_ids?.split(',').includes(gpu.index.toString())) as GpuInfo;
        key = `${gpu?.index || '0'}`;
      }
      if (['queued', 'running', 'stopping'].includes(job.status) && key in jd) {
        jd[key].jobs.push(job);
      } else {
        jd['Idle'].jobs.push(job);
      }
    });
    // sort the queued/running jobs by queue position
    Object.keys(jd).forEach(key => {
      if (key === 'Idle') return;
      jd[key].jobs.sort((a, b) => {
        if (a.queue_position === null) return 1;
        if (b.queue_position === null) return -1;
        return a.queue_position - b.queue_position;
      });
    });
    return jd;
  }, [jobs, gpuList, isGPUInfoLoaded]);

  let isLoading = status === 'loading' || queueStatus === 'loading' || !isGPUInfoLoaded;

  // if job dict is populated, we are always loaded
  if (Object.keys(jobsDict).length > 0) isLoading = false;

  return (
    <div>
      {Object.keys(jobsDict)
        .sort()
        .filter(key => key !== 'Idle')
        .map(gpuKey => {
          const queue = queues.find(q => `${q.gpu_ids}` === gpuKey) as Queue;
          return (
            <div key={gpuKey} className="mb-6">
              <div
                className={clsx(
                  'text-md flex flex-col sm:flex-row px-4 py-1 rounded-t-lg',
                  queue?.is_running ? 'bg-emerald-50 dark:bg-green-900' : 'bg-red-50 dark:bg-red-900',
                )}
              >
                <div className="flex items-center space-x-2 flex-1 py-2">
                  <h2
                    className={clsx(
                      'font-semibold',
                      queue?.is_running ? 'text-emerald-900 dark:text-gray-100' : 'text-red-900 dark:text-gray-100',
                    )}
                  >
                    {jobsDict[gpuKey].name}
                  </h2>
                  <span
                    className={clsx(
                      'px-2 py-0.5 rounded-full text-xs',
                      queue?.is_running
                        ? 'bg-emerald-200 text-emerald-800 dark:bg-gray-700 dark:text-gray-300'
                        : 'bg-red-200 text-red-800 dark:bg-gray-700 dark:text-gray-300',
                    )}
                  >
                    {queue?.gpu_ids === 'mps' ? 'MPS' : `# ${queue?.gpu_ids}`}
                  </span>
                </div>
                <div
                  className={clsx(
                    'text-sm italic flex items-center',
                    queue?.is_running ? 'text-emerald-700 dark:text-gray-300' : 'text-red-700 dark:text-gray-300',
                  )}
                >
                  {queue?.is_running ? (
                    <>
                      <span className="text-emerald-600 dark:text-green-400 mr-2">Queue Running</span>
                      <button
                        onClick={async () => {
                          await stopQueue(queue.gpu_ids as string);
                          refresh();
                        }}
                        className="ml-4 text-xs bg-red-600 hover:bg-red-700 dark:bg-red-900 dark:hover:bg-red-800 text-white px-2 py-1 rounded"
                      >
                        STOP
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-red-600 dark:text-red-400 mr-2">Queue Stopped</span>
                      <button
                        onClick={async () => {
                          await startQueue(gpuKey);
                          refresh();
                        }}
                        className="ml-4 text-xs bg-emerald-600 hover:bg-emerald-700 dark:bg-green-700 dark:hover:bg-green-600 text-white px-2 py-1 rounded"
                      >
                        START
                      </button>
                    </>
                  )}
                </div>
              </div>
              <UniversalTable
                columns={columns}
                rows={jobsDict[gpuKey].jobs}
                isLoading={isLoading}
                onRefresh={refresh}
                theadClassName={queue?.is_running ? 'bg-emerald-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'}
              />
            </div>
          );
        })}
      {!onlyActive && Object.keys(jobsDict).includes('Idle') && (
        <div className="mb-6 opacity-50">
          <div className="text-md flex px-4 py-1 rounded-t-lg bg-zinc-200 dark:bg-slate-600">
            <div className="flex items-center space-x-2 flex-1 py-2">
              <h2 className="font-semibold text-zinc-700 dark:text-gray-100">Idle</h2>
            </div>
          </div>
          <UniversalTable columns={columns} rows={jobsDict['Idle'].jobs} isLoading={isLoading} onRefresh={refresh} />
        </div>
      )}
    </div>
  );
}
