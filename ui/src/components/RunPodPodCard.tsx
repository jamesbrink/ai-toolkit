'use client';

import { useRouter } from 'next/navigation';
import { Cloud, Square, Play, Trash2, DollarSign, Clock } from 'lucide-react';
import clsx from 'clsx';
import { RunPodPodInfo } from '@/hooks/useRunPodPods';
import { openConfirm } from '@/components/ConfirmModal';
import { apiClient } from '@/utils/api';

interface RunPodPodCardProps {
  pod: RunPodPodInfo;
  onRefresh: () => void;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  if (hr < 24) return `${hr}h ${remainMin}m`;
  const days = Math.floor(hr / 24);
  return `${days}d ${hr % 24}h`;
}

function formatCost(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  deploying: {
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    label: 'Deploying',
  },
  running: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', label: 'Running' },
  stopped: { color: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300', label: 'Stopped' },
  error: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', label: 'Error' },
  terminated: { color: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400', label: 'Terminated' },
};

export default function RunPodPodCard({ pod, onRefresh }: RunPodPodCardProps) {
  const router = useRouter();
  const status = statusConfig[pod.currentStatus] || statusConfig.error;

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    openConfirm({
      title: 'Stop Pod',
      message: `Stop "${pod.name}"? The pod will be paused and can be resumed later. You will not be charged while stopped.`,
      type: 'warning',
      confirmText: 'Stop',
      onConfirm: async () => {
        await apiClient.post(`/api/runpod/pods/${pod.id}/stop`);
        onRefresh();
      },
    });
  };

  const handleResume = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await apiClient.post(`/api/runpod/pods/${pod.id}/resume`);
    onRefresh();
  };

  const handleTerminate = (e: React.MouseEvent) => {
    e.stopPropagation();
    openConfirm({
      title: 'Terminate Pod',
      message: `Permanently terminate "${pod.name}"? All data on the pod will be lost. Total spend: ${formatCost(pod.estimatedSpend)}.`,
      type: 'danger',
      confirmText: 'Terminate',
      onConfirm: async () => {
        try {
          await apiClient.post(`/api/runpod/pods/${pod.id}/terminate`);
          onRefresh();
        } catch (err: unknown) {
          const resp = (err as { response?: { status?: number; data?: { activeJobCount?: number } } })?.response;
          if (resp?.status === 409) {
            const count = resp.data?.activeJobCount ?? 0;
            openConfirm({
              title: 'Active Jobs Running',
              message: `This pod has ${count} active job(s). Terminating will stop them immediately and all unsaved progress will be lost. Continue?`,
              type: 'danger',
              confirmText: 'Force Terminate',
              onConfirm: async () => {
                await apiClient.post(`/api/runpod/pods/${pod.id}/terminate`, { confirmTerminate: true });
                onRefresh();
              },
            });
          } else {
            throw err;
          }
        }
      },
    });
  };

  const isActive = pod.currentStatus === 'running' || pod.currentStatus === 'deploying';
  const isStopped = pod.currentStatus === 'stopped';

  return (
    <div
      onClick={() => router.push(`/runpod/${pod.id}`)}
      className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 border border-zinc-200 dark:border-zinc-800 cursor-pointer"
    >
      {/* Header */}
      <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <Cloud className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0" />
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{pod.name}</h2>
          <span className={clsx('px-2 py-0.5 rounded-full text-xs', status.color)}>{status.label}</span>
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          {isActive && (
            <button
              onClick={handleStop}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-yellow-600 dark:hover:text-yellow-400 rounded transition-colors"
              title="Stop"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
          {isStopped && (
            <button
              onClick={handleResume}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-400 rounded transition-colors"
              title="Resume"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          {pod.currentStatus !== 'terminated' && (
            <button
              onClick={handleTerminate}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
              title="Terminate"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-zinc-700 dark:text-zinc-300">{pod.gpuTypeDisplay}</span>
          {pod.gpuCount > 1 && <span className="text-xs text-zinc-600 dark:text-zinc-400">x{pod.gpuCount}</span>}
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <DollarSign className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{formatCost(pod.costPerHr)}/hr</span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{formatUptime(pod.totalUptimeSeconds)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Spend: {formatCost(pod.estimatedSpend)}</span>
          <div className="flex items-center space-x-1">
            {pod.instanceType === 'SPOT' && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                Spot
              </span>
            )}
            <span
              className={clsx(
                'px-2 py-0.5 rounded-full text-xs',
                pod.cloudType === 'SECURE'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',
              )}
            >
              {pod.cloudType === 'SECURE' ? 'Secure' : 'Community'}
            </span>
          </div>
        </div>

        {pod.dataCenterName && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {pod.dataCenterName}
            {pod.dataCenterRegion ? ` — ${pod.dataCenterRegion}` : ''}
          </p>
        )}

        {pod.hostId && (
          <div className="flex items-center space-x-1.5">
            <span
              className={clsx(
                'w-2 h-2 rounded-full shrink-0',
                pod.currentStatus === 'running' ? 'bg-green-500' : 'bg-zinc-400 dark:bg-zinc-500',
              )}
            />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {pod.currentStatus === 'running' ? 'Host connected' : 'Host linked (offline)'}
            </span>
          </div>
        )}

        {pod.errorMessage && <p className="text-xs text-red-400 truncate">{pod.errorMessage}</p>}
      </div>
    </div>
  );
}
