'use client';

import { TopBar, MainContent } from '@/components/layout';
import HostCard from '@/components/HostCard';
import useHostList from '@/hooks/useHostList';
import { openConfirm } from '@/components/ConfirmModal';
import { apiClient } from '@/utils/api';
import { Plus, Network } from 'lucide-react';

export default function HostsPage() {
  const { hosts, status, refreshHosts } = useHostList();

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
        <button
          onClick={handleAddHost}
          className="flex items-center space-x-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Host</span>
        </button>
      </TopBar>
      <MainContent>
        {status === 'success' && hosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Network className="w-12 h-12 text-gray-600 mb-4" />
            <p className="text-gray-400 max-w-md">
              No hosts discovered yet. Other AI Toolkit instances on your network will appear here automatically, or add
              one manually.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {hosts.map(host => (
              <HostCard key={host.id} host={host} onRefresh={refreshHosts} />
            ))}
          </div>
        )}
      </MainContent>
    </>
  );
}
