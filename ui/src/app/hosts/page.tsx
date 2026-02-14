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
import useRunPodAccount from '@/hooks/useRunPodAccount';
import useSettings from '@/hooks/useSettings';
import { openConfirm } from '@/components/ConfirmModal';
import { apiClient } from '@/utils/api';
import RunPodAccountWidget from '@/components/RunPodAccountWidget';
import LocalHostCard from '@/components/LocalHostCard';
import { Button } from '@/components/catalyst/button';
import { Heading, Subheading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Plus, Network, Cloud, Settings } from 'lucide-react';

export default function HostsPage() {
  const { hosts, status, refreshHosts } = useHostList();
  const { settings, isSettingsLoaded } = useSettings();
  const hasRunPodKey = isSettingsLoaded && settings.RUNPOD_API_KEY.length > 0;
  const { pods, refreshPods } = useRunPodPods(5000, hasRunPodKey);
  const { gpuTypes } = useRunPodGpuTypes(hasRunPodKey);
  const { account } = useRunPodAccount(hasRunPodKey);
  const [deployOpen, setDeployOpen] = useState(false);
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
          <Heading level={1} className="text-lg">
            Hosts
          </Heading>
        </div>
        <div className="flex-1"></div>
        <div className="flex items-center space-x-2">
          {hasRunPodKey && (
            <Button color="blue" onClick={() => setDeployOpen(true)}>
              <Cloud className="w-4 h-4" />
              Deploy RunPod
            </Button>
          )}
          <Button outline onClick={handleAddHost}>
            <Plus className="w-4 h-4" />
            Add Host
          </Button>
        </div>
      </TopBar>
      <MainContent>
        {/* This Machine Section */}
        <div className="mb-8">
          <Subheading level={2} className="text-sm uppercase tracking-wide mb-4">
            This Machine
          </Subheading>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <LocalHostCard />
          </div>
        </div>

        {/* Cloud Pods Section */}
        <div className="mb-8">
          <Subheading level={2} className="text-sm uppercase tracking-wide mb-4">
            Cloud Pods
          </Subheading>
          {account && <RunPodAccountWidget account={account} />}
          {!hasRunPodKey ? (
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 text-center">
              <Cloud className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
              <Text className="mb-3">Configure your RunPod API key to deploy cloud GPU pods.</Text>
              <Link
                href="/settings"
                className="inline-flex items-center space-x-1 text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 text-sm transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>Go to Settings</span>
              </Link>
            </div>
          ) : activePods.length === 0 ? (
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 text-center">
              <Cloud className="w-8 h-8 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
              <Text>No active cloud pods. Click &quot;Deploy RunPod&quot; to get started.</Text>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activePods.map(pod => (
                <RunPodPodCard key={pod.id} pod={pod} onRefresh={refreshPods} />
              ))}
            </div>
          )}
        </div>

        {/* Network Hosts Section */}
        <div>
          <Subheading level={2} className="text-sm uppercase tracking-wide mb-4">
            Network Hosts
          </Subheading>
          {status === 'success' && hosts.filter(h => h.source !== 'runpod').length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Network className="w-12 h-12 text-zinc-400 dark:text-zinc-600 mb-4" />
              <Text className="max-w-md">
                No hosts discovered yet. Other AI Toolkit instances on your network will appear here automatically, or
                add one manually.
              </Text>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {hosts
                .filter(h => h.source !== 'runpod')
                .map(host => (
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
        defaultSshKey={settings.RUNPOD_SSH_PUBLIC_KEY}
      />
    </>
  );
}
