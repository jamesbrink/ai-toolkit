import Link from 'next/link';
import { Trash2, Pen, Play, Pause, Cog, X } from 'lucide-react';
import { Button } from '@/components/catalyst/button';
import { openConfirm } from '@/components/ConfirmModal';
import { Job } from '@/server/prismaTypes';
import { DataSource, UnifiedJob } from '@/types';
import { startJob, stopJob, deleteJob, getAvaliableJobActions, markJobAsStopped } from '@/utils/jobs';
import { startQueue } from '@/utils/queue';
import {
  startJobOnHost,
  stopJobOnHost,
  deleteJobOnHost,
  markJobAsStoppedOnHost,
  startQueueOnHost,
} from '@/utils/remoteActions';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';

interface JobActionBarProps {
  job: Job | UnifiedJob;
  source?: DataSource;
  onRefresh?: () => void;
  afterDelete?: () => void;
  hideView?: boolean;
  className?: string;
  autoStartQueue?: boolean;
}

export default function JobActionBar({
  job,
  source,
  onRefresh,
  afterDelete,
  className,
  hideView: _hideView,
  autoStartQueue = false,
}: JobActionBarProps) {
  const { canStart, canStop, canEdit, canRemoveFromQueue } = getAvaliableJobActions(job);
  const isRemote = source?.type === 'remote';

  if (!afterDelete) afterDelete = onRefresh;

  const doStartJob = async () => {
    if (isRemote) {
      await startJobOnHost(source!, job.id);
    } else {
      await startJob(job.id);
    }
  };

  const doStopJob = async () => {
    if (isRemote) {
      await stopJobOnHost(source!, job.id);
    } else {
      await stopJob(job.id);
    }
  };

  const doDeleteJob = async () => {
    if (isRemote) {
      await deleteJobOnHost(source!, job.id);
    } else {
      await deleteJob(job.id);
    }
  };

  const doMarkStopped = async () => {
    if (isRemote) {
      await markJobAsStoppedOnHost(source!, job.id);
    } else {
      await markJobAsStopped(job.id);
    }
  };

  const doStartQueue = async (gpuIds: string) => {
    if (isRemote) {
      await startQueueOnHost(source!, gpuIds);
    } else {
      await startQueue(gpuIds);
    }
  };

  return (
    <div className={`flex items-center ${className ?? ''}`}>
      {canStart && (
        <Button
          plain
          onClick={async () => {
            if (!canStart) return;
            await doStartJob();
            if (autoStartQueue) {
              await doStartQueue(job.gpu_ids);
            }
            if (onRefresh) onRefresh();
          }}
          className="ml-1"
        >
          <Play className="w-5 h-5" />
        </Button>
      )}
      {canRemoveFromQueue && (
        <Button
          plain
          onClick={async () => {
            if (!canRemoveFromQueue) return;
            await doMarkStopped();
            if (onRefresh) onRefresh();
          }}
          className="ml-1"
        >
          <X className="w-5 h-5" />
        </Button>
      )}
      {canStop && (
        <Button
          plain
          onClick={() => {
            if (!canStop) return;
            openConfirm({
              title: 'Stop Job',
              message: `Are you sure you want to stop the job "${job.name}"? You CAN resume later.`,
              type: 'info',
              confirmText: 'Stop',
              onConfirm: async () => {
                await doStopJob();
                if (onRefresh) onRefresh();
              },
            });
          }}
          className="ml-1"
        >
          <Pause className="w-5 h-5" />
        </Button>
      )}
      {canEdit && !isRemote && (
        <Button plain href={`/jobs/new?id=${job.id}`} className="ml-1">
          <Pen className="w-5 h-5" />
        </Button>
      )}
      <Button
        plain
        onClick={() => {
          let message = `Are you sure you want to delete the job "${job.name}"? This will also permanently remove it from ${isRemote ? source?.hostName || 'the remote host' : 'your disk'}.`;
          if (job.status === 'running') {
            message += ' WARNING: The job is currently running. You should stop it first if you can.';
          }
          openConfirm({
            title: 'Delete Job',
            message: message,
            type: 'warning',
            confirmText: 'Delete',
            onConfirm: async () => {
              if (job.status === 'running') {
                try {
                  await doStopJob();
                } catch (e) {
                  console.error('Error stopping job before deleting:', e);
                }
              }
              await doDeleteJob();
              if (afterDelete) afterDelete();
            },
          });
        }}
        className="ml-1"
      >
        <Trash2 className="w-5 h-5" />
      </Button>
      <div className="border-r border-zinc-300 dark:border-zinc-700 ml-2 h-6"></div>
      <Menu as="div" className="flex items-center">
        <MenuButton className="ml-1 p-2.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
          <Cog className="w-5 h-5" />
        </MenuButton>
        <MenuItems
          anchor="bottom"
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg w-48 px-2 py-2 mt-4 text-zinc-800 dark:text-zinc-200"
        >
          <MenuItem>
            <Link
              href={`/jobs/new?cloneId=${job.id}${isRemote && source?.hostId ? `&sourceHostId=${source.hostId}` : ''}`}
              className="cursor-pointer px-4 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded block text-zinc-800 dark:text-zinc-200"
            >
              Clone Job
            </Link>
          </MenuItem>
          <MenuItem>
            <div
              className="cursor-pointer px-4 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-800 dark:text-zinc-200"
              onClick={() => {
                const message = `Are you sure you want to mark this job as stopped? This will set the job status to 'stopped' if the status is hung. Only do this if you are 100% sure the job is stopped. This will NOT stop the job.`;
                openConfirm({
                  title: 'Mark Job as Stopped',
                  message: message,
                  type: 'warning',
                  confirmText: 'Mark as Stopped',
                  onConfirm: async () => {
                    await doMarkStopped();
                    if (onRefresh) onRefresh();
                  },
                });
              }}
            >
              Mark as Stopped
            </div>
          </MenuItem>
        </MenuItems>
      </Menu>
    </div>
  );
}
