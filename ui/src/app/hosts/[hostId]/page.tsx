'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar, MainContent } from '@/components/layout';
import { ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import { apiClient } from '@/utils/api';
import { HostInfo } from '@/hooks/useHostList';
import HostDetailContent from '@/components/HostDetailContent';

export default function HostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const hostId = params.hostId as string;

  const [host, setHost] = useState<HostInfo | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!hostId) return;
    setStatus('loading');
    apiClient
      .get(`/api/hosts/${hostId}`)
      .then(res => {
        setHost(res.data);
        setStatus('success');
      })
      .catch(err => {
        console.error('Failed to fetch host:', err);
        setStatus('error');
      });
  }, [hostId]);

  return (
    <>
      <TopBar>
        <button
          onClick={() => router.push('/hosts')}
          className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded transition-colors"
          aria-label="Back to hosts"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center space-x-2 ml-1">
          <h1 className="text-lg">{host?.name || 'Host'}</h1>
          {host && <span className={clsx('w-2.5 h-2.5 rounded-full', host.isOnline ? 'bg-green-500' : 'bg-red-500')} />}
        </div>
        <div className="flex-1"></div>
      </TopBar>
      <MainContent>
        {status === 'error' && <p className="text-red-600 dark:text-red-400">Failed to load host information.</p>}
        {host && (
          <HostDetailContent
            mode="remote"
            hostId={hostId}
            hostName={host.name}
            connectionInfo={{
              address: host.address,
              port: host.port,
              source: host.source,
              instanceId: host.instanceId,
              lastSeen: host.lastSeen,
              isOnline: host.isOnline,
              gpuSummary: host.gpuSummary,
              deviceType: host.deviceType,
            }}
          />
        )}
      </MainContent>
    </>
  );
}
