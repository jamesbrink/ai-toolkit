'use client';

import Link from 'next/link';
import { Server, Database, Briefcase } from 'lucide-react';
import clsx from 'clsx';
import GpuMonitor from '@/components/GPUMonitor';
import GPUWidget from '@/components/GPUWidget';
import { GPUWidgetSkeleton } from '@/components/Skeleton';
import JobsTable from '@/components/JobsTable';
import UniversalTable, { TableColumn } from '@/components/UniversalTable';
import useRemoteGPUInfo from '@/hooks/useRemoteGPUInfo';
import useRemoteJobs, { RemoteJob } from '@/hooks/useRemoteJobs';
import useDatasetList, { DatasetInfo } from '@/hooks/useDatasetList';
import useRemoteDatasetList from '@/hooks/useRemoteDatasetList';
import { Subheading } from '@/components/catalyst/heading';
import { CgSpinner } from 'react-icons/cg';

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
        {mode === 'local' ? <LocalJobsSection /> : <RemoteJobsSection hostId={hostId!} />}
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

// ─── Jobs Sections ─────────────────────────────────────────────────

function getJobStatusClass(status: string): string {
  if (status === 'running') return 'text-blue-600 dark:text-blue-400';
  if (status === 'completed') return 'text-green-600 dark:text-green-400';
  if (status === 'error' || status === 'failed') return 'text-red-600 dark:text-red-400';
  return 'text-zinc-600 dark:text-zinc-400';
}

function LocalJobsSection() {
  return <JobsTable onlyActive={false} />;
}

function RemoteJobsSection({ hostId }: { hostId: string }) {
  const { jobs, status, refreshJobs } = useRemoteJobs(hostId);

  const columns: TableColumn<RemoteJob>[] = [
    {
      title: 'Name',
      key: 'name',
      sortable: true,
      render: (row: RemoteJob) => (
        <Link
          href={`/jobs/${row.id}?hostId=${hostId}`}
          className="flex items-center gap-2 hover:text-zinc-950 dark:hover:text-white"
        >
          {['running', 'stopping'].includes(row.status) && (
            <CgSpinner className="inline animate-spin text-blue-400 flex-shrink-0" />
          )}
          <span className="font-medium whitespace-nowrap">{row.name}</span>
        </Link>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      sortable: true,
      render: (row: RemoteJob) => <span className={getJobStatusClass(row.status)}>{row.status}</span>,
    },
    {
      title: 'Step',
      key: 'step',
      sortable: true,
    },
    {
      title: 'Speed',
      key: 'speed_string',
      sortable: true,
      render: (row: RemoteJob) => <span>{row.speed_string || '-'}</span>,
    },
  ];

  if (status === 'loading' && jobs.length === 0) {
    return (
      <UniversalTable
        columns={columns}
        rows={[]}
        isLoading={true}
        onRefresh={refreshJobs}
        defaultSortKey="name"
        defaultSortDir="asc"
      />
    );
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
    <UniversalTable
      columns={columns}
      rows={jobs}
      isLoading={false}
      onRefresh={refreshJobs}
      defaultSortKey="name"
      defaultSortDir="asc"
    />
  );
}

// ─── Dataset Sections ──────────────────────────────────────────────

function datasetColumns(linkable: boolean): TableColumn<DatasetInfo>[] {
  return [
    {
      title: 'Name',
      key: 'name',
      sortable: true,
      render: (row: DatasetInfo) =>
        linkable ? (
          <Link
            href={`/datasets/${encodeURIComponent(row.name)}`}
            className="font-medium whitespace-nowrap hover:text-zinc-950 dark:hover:text-white"
          >
            {row.name}
          </Link>
        ) : (
          <span className="font-medium whitespace-nowrap">{row.name}</span>
        ),
    },
    {
      title: 'Images',
      key: 'imageCount',
      sortable: true,
    },
    {
      title: 'Captions',
      key: 'captionCount',
      sortable: true,
      render: (row: DatasetInfo) => {
        if (row.imageCount === 0) return <span>0</span>;
        const pct = Math.round((row.captionCount / row.imageCount) * 100);
        return (
          <span>
            {row.captionCount}
            <span
              className={clsx(
                'ml-1.5 text-xs',
                pct === 100
                  ? 'text-green-600 dark:text-green-400'
                  : pct >= 50
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-zinc-500 dark:text-zinc-500',
              )}
            >
              ({pct}%)
            </span>
          </span>
        );
      },
    },
    {
      title: 'Size',
      key: 'totalSizeBytes',
      sortable: true,
      render: (row: DatasetInfo) => <span>{formatBytes(row.totalSizeBytes)}</span>,
    },
  ];
}

function LocalDatasetsSection() {
  const { datasets, status, refreshDatasets } = useDatasetList();

  if (status === 'loading' && datasets.length === 0) {
    return (
      <UniversalTable
        columns={datasetColumns(true)}
        rows={[]}
        isLoading={true}
        onRefresh={refreshDatasets}
        defaultSortKey="name"
        defaultSortDir="asc"
      />
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 text-center">
        <Database className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No datasets found.</p>
      </div>
    );
  }

  return (
    <UniversalTable
      columns={datasetColumns(true)}
      rows={datasets}
      isLoading={false}
      onRefresh={refreshDatasets}
      defaultSortKey="name"
      defaultSortDir="asc"
    />
  );
}

function RemoteDatasetsSection({ hostId }: { hostId: string }) {
  const { datasets, status, refreshDatasets } = useRemoteDatasetList(hostId);

  if (status === 'loading' && datasets.length === 0) {
    return (
      <UniversalTable
        columns={datasetColumns(false)}
        rows={[]}
        isLoading={true}
        onRefresh={refreshDatasets}
        defaultSortKey="name"
        defaultSortDir="asc"
      />
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 text-center">
        <Database className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No datasets found.</p>
      </div>
    );
  }

  return (
    <UniversalTable
      columns={datasetColumns(false)}
      rows={datasets}
      isLoading={false}
      onRefresh={refreshDatasets}
      defaultSortKey="name"
      defaultSortDir="asc"
    />
  );
}
