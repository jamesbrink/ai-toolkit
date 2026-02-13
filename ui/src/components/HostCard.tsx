'use client';

import { useRouter } from 'next/navigation';
import { Server, Edit, EyeOff, Trash2, Wifi, WifiOff } from 'lucide-react';
import classNames from 'classnames';
import { HostInfo } from '@/hooks/useHostList';
import { openConfirm } from '@/components/ConfirmModal';
import { apiClient } from '@/utils/api';

interface HostCardProps {
  host: HostInfo;
  onRefresh: () => void;
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return 'Never';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function HostCard({ host, onRefresh }: HostCardProps) {
  const router = useRouter();

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    openConfirm({
      title: 'Edit Host',
      message: 'Enter a display name for this host.',
      type: 'info',
      inputTitle: 'Host name',
      defaultInputValue: host.name,
      confirmText: 'Save',
      onConfirm: async value => {
        if (value && value !== host.name) {
          await apiClient.patch(`/api/hosts/${host.id}`, { name: value });
          onRefresh();
        }
      },
    });
  };

  const handleHide = (e: React.MouseEvent) => {
    e.stopPropagation();
    openConfirm({
      title: 'Hide Host',
      message: `Hide "${host.name}" from the hosts list? It will reappear if discovered again via mDNS.`,
      type: 'warning',
      confirmText: 'Hide',
      onConfirm: async () => {
        await apiClient.patch(`/api/hosts/${host.id}`, { isHidden: true });
        onRefresh();
      },
    });
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    openConfirm({
      title: 'Remove Host',
      message: `Permanently remove "${host.name}"? This cannot be undone.`,
      type: 'danger',
      confirmText: 'Remove',
      onConfirm: async () => {
        await apiClient.delete(`/api/hosts/${host.id}`);
        onRefresh();
      },
    });
  };

  return (
    <div
      onClick={() => router.push(`/hosts/${host.id}`)}
      className="bg-gray-900 rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 border border-gray-800 cursor-pointer"
    >
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <Server className="w-4 h-4 text-gray-400 shrink-0" />
          <h2 className="font-semibold text-gray-100 truncate">{host.name}</h2>
          <span
            className={classNames('w-2 h-2 rounded-full shrink-0', host.isOnline ? 'bg-green-500' : 'bg-red-500')}
          />
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          <button
            onClick={handleEdit}
            className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
            title="Edit"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleHide}
            className="p-1.5 text-gray-400 hover:text-yellow-400 rounded transition-colors"
            title="Hide"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRemove}
            className="p-1.5 text-gray-400 hover:text-red-400 rounded transition-colors"
            title="Remove"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div className="flex items-center space-x-2">
          {host.isOnline ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
          <span className="text-sm text-gray-300">
            {host.address}:{host.port}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <span
            className={classNames(
              'px-2 py-0.5 rounded-full text-xs',
              host.source === 'mdns'
                ? 'bg-blue-900 text-blue-300'
                : host.source === 'runpod'
                  ? 'bg-purple-900 text-purple-300'
                  : 'bg-gray-700 text-gray-300',
            )}
          >
            {host.source === 'mdns' ? 'mDNS' : host.source === 'runpod' ? 'RunPod' : 'Manual'}
          </span>
          {host.deviceType && (
            <span className="px-2 py-0.5 bg-gray-700 rounded-full text-xs text-gray-300">
              {host.deviceType.toUpperCase()}
            </span>
          )}
        </div>

        {host.gpuSummary && <p className="text-sm text-gray-400 truncate">{host.gpuSummary}</p>}

        <p className="text-xs text-gray-400">Last seen: {relativeTime(host.lastSeen)}</p>
      </div>
    </div>
  );
}
