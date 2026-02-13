'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar, MainContent } from '@/components/layout';
import { ArrowLeft, Server } from 'lucide-react';
import clsx from 'clsx';
import { apiClient } from '@/utils/api';
import { HostInfo } from '@/hooks/useHostList';

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
          <div className="max-w-2xl space-y-4">
            {/* Connection Info */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-3 flex items-center space-x-2">
                <Server className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Connection Info</h2>
              </div>
              <div className="p-4 space-y-3">
                <InfoRow label="Address" value={host.address} />
                <InfoRow label="Port" value={String(host.port)} />
                <InfoRow
                  label="Source"
                  value={
                    host.source === 'mdns'
                      ? 'mDNS (auto-discovered)'
                      : host.source === 'runpod'
                        ? 'RunPod (cloud pod)'
                        : 'Manual'
                  }
                />
                <InfoRow label="Device Type" value={host.deviceType ? host.deviceType.toUpperCase() : 'Unknown'} />
                <InfoRow label="GPU Summary" value={host.gpuSummary || 'N/A'} />
                <InfoRow label="Instance ID" value={host.instanceId || 'N/A'} />
                <InfoRow label="Last Seen" value={host.lastSeen ? new Date(host.lastSeen).toLocaleString() : 'Never'} />
                <InfoRow
                  label="Status"
                  value={host.isOnline ? 'Online' : 'Offline'}
                  valueClass={host.isOnline ? 'text-green-400' : 'text-red-400'}
                />
              </div>
            </div>
          </div>
        )}
      </MainContent>
    </>
  );
}

function InfoRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start">
      <span className="text-sm text-zinc-600 dark:text-zinc-400 w-32 shrink-0">{label}</span>
      <span className={clsx('text-sm text-zinc-900 dark:text-zinc-200 break-all', valueClass)}>{value}</span>
    </div>
  );
}
