'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TopBar, MainContent } from '@/components/layout';
import HostCard from '@/components/HostCard';
import RunPodPodCard from '@/components/RunPodPodCard';
import DeployPodModal from '@/components/DeployPodModal';
import useHostList from '@/hooks/useHostList';
import useRunPodPods from '@/hooks/useRunPodPods';
import useRunPodGpuTypes from '@/hooks/useRunPodGpuTypes';
import useSettings from '@/hooks/useSettings';
import { openConfirm } from '@/components/ConfirmModal';
import { apiClient } from '@/utils/api';
import { Plus, Network, Cloud, Settings } from 'lucide-react';

export default function HostsPage() {
  const { hosts, status, refreshHosts } = useHostList();
  const { pods, refreshPods } = useRunPodPods();
  const { gpuTypes } = useRunPodGpuTypes();
  const { settings, isSettingsLoaded } = useSettings();
  const [deployOpen, setDeployOpen] = useState(false);

  const hasRunPodKey = isSettingsLoaded && settings.RUNPOD_API_KEY.length > 0;
  const activePods = pods.filter(p => p.currentStatus !== 'terminated');

  const handleAddHost = () => {
    openConfirm({
      title: 'Add Host',
      message: 'Enter the host address (e.g. 192.168.1.100:8675 or hostname:8675).',
      type: 'info',
      inputTitle: 'address:port',
      confirmText: 'Add',
      onConfirm: async value => {
        if (!value) return;
        const parts = value.split(':');
        const address = parts[0];
        const port = parts.length > 1 ? parseInt(parts[1], 10) : 8675;
        await apiClient.post('/api/hosts', { address, port });
        refreshHosts();
      },
    });
  };

  return (
    <>
      <TopBar>
        <div>
          <h1 className="text-lg">Hosts</h1>
        </div>
        <div className="flex-1"></div>
        <div className="flex items-center space-x-2">
          {hasRunPodKey && (
            <button
              onClick={() => setDeployOpen(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors text-sm"
            >
              <Cloud className="w-4 h-4" />
              <span>Deploy RunPod</span>
            </button>
          )}
          <button
            onClick={handleAddHost}
            className="flex items-center space-x-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Host</span>
          </button>
        </div>
      </TopBar>
      <MainContent>
        {/* Cloud Pods Section */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">Cloud Pods</h2>
          {!hasRunPodKey ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
              <Cloud className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 mb-3">
                Configure your RunPod API key to deploy cloud GPU pods.
              </p>
              <Link
                href="/settings"
                className="inline-flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-sm transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>Go to Settings</span>
              </Link>
            </div>
          ) : activePods.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
              <Cloud className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No active cloud pods. Click &quot;Deploy RunPod&quot; to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activePods.map(pod => (
                <RunPodPodCard key={pod.id} pod={pod} onRefresh={refreshPods} />
              ))}
            </div>
          )}
        </div>

        {/* Local Hosts Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">Local Hosts</h2>
          {status === 'success' && hosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Network className="w-12 h-12 text-gray-600 mb-4" />
              <p className="text-gray-400 max-w-md">
                No hosts discovered yet. Other AI Toolkit instances on your network will appear here automatically, or
                add one manually.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {hosts.map(host => (
                <HostCard key={host.id} host={host} onRefresh={refreshHosts} />
              ))}
            </div>
          )}
        </div>
      </MainContent>

      <DeployPodModal
        isOpen={deployOpen}
        onClose={() => setDeployOpen(false)}
        gpuTypes={gpuTypes}
        onDeployed={refreshPods}
      />
    </>
  );
}
