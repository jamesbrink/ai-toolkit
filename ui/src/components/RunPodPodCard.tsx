'use client';

import { useRouter } from 'next/navigation';
import { Cloud, Square, Play, Trash2, DollarSign, Clock } from 'lucide-react';
import classNames from 'classnames';
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
  deploying: { color: 'bg-yellow-900 text-yellow-300', label: 'Deploying' },
  running: { color: 'bg-green-900 text-green-300', label: 'Running' },
  stopped: { color: 'bg-gray-700 text-gray-300', label: 'Stopped' },
  error: { color: 'bg-red-900 text-red-300', label: 'Error' },
  terminated: { color: 'bg-gray-700 text-gray-400', label: 'Terminated' },
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
        await apiClient.post(`/api/runpod/pods/${pod.id}/terminate`);
        onRefresh();
      },
    });
  };

  const isActive = pod.currentStatus === 'running' || pod.currentStatus === 'deploying';
  const isStopped = pod.currentStatus === 'stopped';

  return (
    <div
      onClick={() => router.push(`/runpod/${pod.id}`)}
      className="bg-gray-900 rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 border border-gray-800 cursor-pointer"
    >
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <Cloud className="w-4 h-4 text-gray-400 shrink-0" />
          <h2 className="font-semibold text-gray-100 truncate">{pod.name}</h2>
          <span className={classNames('px-2 py-0.5 rounded-full text-xs', status.color)}>{status.label}</span>
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          {isActive && (
            <button
              onClick={handleStop}
              className="p-1.5 text-gray-400 hover:text-yellow-400 rounded transition-colors"
              title="Stop"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
          {isStopped && (
            <button
              onClick={handleResume}
              className="p-1.5 text-gray-400 hover:text-green-400 rounded transition-colors"
              title="Resume"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          {pod.currentStatus !== 'terminated' && (
            <button
              onClick={handleTerminate}
              className="p-1.5 text-gray-400 hover:text-red-400 rounded transition-colors"
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
          <span className="text-sm text-gray-300">{pod.gpuTypeDisplay}</span>
          {pod.gpuCount > 1 && <span className="text-xs text-gray-400">x{pod.gpuCount}</span>}
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <DollarSign className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm text-gray-300">{formatCost(pod.costPerHr)}/hr</span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm text-gray-300">{formatUptime(pod.totalUptimeSeconds)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Spend: {formatCost(pod.estimatedSpend)}</span>
          <span
            className={classNames(
              'px-2 py-0.5 rounded-full text-xs',
              pod.cloudType === 'SECURE' ? 'bg-blue-900 text-blue-300' : 'bg-gray-700 text-gray-300',
            )}
          >
            {pod.cloudType === 'SECURE' ? 'Secure' : 'Community'}
          </span>
        </div>

        {pod.hostId && <p className="text-xs text-gray-400">Linked to host</p>}

        {pod.errorMessage && <p className="text-xs text-red-400 truncate">{pod.errorMessage}</p>}
      </div>
    </div>
  );
}
