'use client';

import Link from 'next/link';
import { Server, Database, Briefcase } from 'lucide-react';
import clsx from 'clsx';
import GpuMonitor from '@/components/GPUMonitor';
import GPUWidget from '@/components/GPUWidget';
import { GPUWidgetSkeleton } from '@/components/Skeleton';
import JobsTable from '@/components/JobsTable';
import useRemoteGPUInfo from '@/hooks/useRemoteGPUInfo';
import useRemoteJobs from '@/hooks/useRemoteJobs';
import useDatasetList, { DatasetInfo } from '@/hooks/useDatasetList';
import useRemoteDatasetList from '@/hooks/useRemoteDatasetList';
import { Subheading } from '@/components/catalyst/heading';
import { RemoteJob } from '@/hooks/useRemoteJobs';

interface ConnectionInfo {
  address: string;
  port: number;
  source: string;
  instanceId?: string;
  lastSeen?: string;
  isOnline: boolean;
  gpuSummary?: string;
  deviceType?: string;
}

interface HostDetailContentProps {
  mode: 'local' | 'remote';
  hostId?: string;
  hostName: string;
  connectionInfo?: ConnectionInfo;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function InfoRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start">
      <span className="text-sm text-zinc-600 dark:text-zinc-400 w-32 shrink-0">{label}</span>
      <span className={clsx('text-sm text-zinc-900 dark:text-zinc-200 break-all', valueClass)}>{value}</span>
    </div>
  );
}

export default function HostDetailContent({ mode, hostId, hostName, connectionInfo }: HostDetailContentProps) {
  return (
    <div className="space-y-8">
      {/* GPU Monitor */}
      <section>
        <Subheading level={2} className="text-sm uppercase tracking-wide mb-4">
          GPU Monitor
        </Subheading>
        {mode === 'local' ? <GpuMonitor /> : <RemoteGpuSection hostId={hostId!} hostName={hostName} />}
      </section>

      {/* Jobs */}
      <section>
        <Subheading level={2} className="text-sm uppercase tracking-wide mb-4">
          Jobs
        </Subheading>
        {mode === 'local' ? <JobsTable /> : <RemoteJobsSection hostId={hostId!} />}
      </section>

      {/* Datasets */}
      <section>
        <Subheading level={2} className="text-sm uppercase tracking-wide mb-4">
          Datasets
        </Subheading>
        {mode === 'local' ? <LocalDatasetsSection /> : <RemoteDatasetsSection hostId={hostId!} />}
      </section>

      {/* Connection Info (remote only) */}
      {mode === 'remote' && connectionInfo && (
        <section>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden max-w-2xl">
            <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-3 flex items-center space-x-2">
              <Server className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Connection Info</h2>
            </div>
            <div className="p-4 space-y-3">
              <InfoRow label="Address" value={connectionInfo.address} />
              <InfoRow label="Port" value={String(connectionInfo.port)} />
              <InfoRow
                label="Source"
                value={
                  connectionInfo.source === 'mdns'
                    ? 'mDNS (auto-discovered)'
                    : connectionInfo.source === 'runpod'
                      ? 'RunPod (cloud pod)'
                      : 'Manual'
                }
              />
              <InfoRow
                label="Device Type"
                value={connectionInfo.deviceType ? connectionInfo.deviceType.toUpperCase() : 'Unknown'}
              />
              {connectionInfo.gpuSummary && <InfoRow label="GPU Summary" value={connectionInfo.gpuSummary} />}
              <InfoRow label="Instance ID" value={connectionInfo.instanceId || 'N/A'} />
              <InfoRow
                label="Last Seen"
                value={connectionInfo.lastSeen ? new Date(connectionInfo.lastSeen).toLocaleString() : 'Never'}
              />
              <InfoRow
                label="Status"
                value={connectionInfo.isOnline ? 'Online' : 'Offline'}
                valueClass={connectionInfo.isOnline ? 'text-green-400' : 'text-red-400'}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function RemoteGpuSection({ hostId, hostName }: { hostId: string; hostName: string }) {
  const { gpuList, status } = useRemoteGPUInfo(hostId);

  if (status === 'loading' && gpuList.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <GPUWidgetSkeleton />
        <GPUWidgetSkeleton />
      </div>
    );
  }

  if (gpuList.length === 0) {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No GPUs detected on this host.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {gpuList.map((gpu, idx) => (
        <GPUWidget key={`${hostId}-${gpu.index}-${idx}`} gpu={gpu} hostName={hostName} isRemote />
      ))}
    </div>
  );
}

function RemoteJobsSection({ hostId }: { hostId: string }) {
  const { jobs, status } = useRemoteJobs(hostId);

  if (status === 'loading') {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading jobs...</p>;
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 text-center">
        <Briefcase className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No jobs on this host.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-left">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Step</th>
            <th className="px-4 py-2 font-medium">Speed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {jobs.map((job: RemoteJob) => (
            <tr key={job.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <td className="px-4 py-2 text-zinc-900 dark:text-zinc-200 font-medium">{job.name}</td>
              <td className="px-4 py-2">
                <span
                  className={clsx(
                    'text-xs',
                    job.status === 'running' && 'text-blue-600 dark:text-blue-400',
                    job.status === 'completed' && 'text-green-600 dark:text-green-400',
                    job.status === 'error' && 'text-red-600 dark:text-red-400',
                    !['running', 'completed', 'error'].includes(job.status) && 'text-zinc-600 dark:text-zinc-400',
                  )}
                >
                  {job.status}
                </span>
              </td>
              <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{job.step}</td>
              <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{job.speed_string || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DatasetTable({ datasets, linkable }: { datasets: DatasetInfo[]; linkable: boolean }) {
  if (datasets.length === 0) {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 text-center">
        <Database className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No datasets found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-left">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Images</th>
            <th className="px-4 py-2 font-medium">Captions</th>
            <th className="px-4 py-2 font-medium">Size</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {datasets.map(ds => (
            <tr key={ds.name} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <td className="px-4 py-2 text-zinc-900 dark:text-zinc-200 font-medium">
                {linkable ? (
                  <Link href={`/datasets/${ds.name}`} className="hover:text-blue-600 dark:hover:text-blue-400">
                    {ds.name}
                  </Link>
                ) : (
                  ds.name
                )}
              </td>
              <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{ds.imageCount}</td>
              <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{ds.captionCount}</td>
              <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{formatBytes(ds.totalSizeBytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LocalDatasetsSection() {
  const { datasets, status } = useDatasetList();

  if (status === 'loading') {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading datasets...</p>;
  }

  return <DatasetTable datasets={datasets} linkable />;
}

function RemoteDatasetsSection({ hostId }: { hostId: string }) {
  const { datasets, status } = useRemoteDatasetList(hostId);

  if (status === 'loading') {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading datasets...</p>;
  }

  return <DatasetTable datasets={datasets} linkable={false} />;
}
