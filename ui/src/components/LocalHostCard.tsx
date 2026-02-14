'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Monitor, Wifi } from 'lucide-react';
import { Badge } from '@/components/catalyst/badge';
import { getDeviceBadgeColor } from '@/utils/deviceBadge';
import { apiClient } from '@/utils/api';

interface LocalIdentity {
  hostname: string;
  deviceType: string;
  port: number;
}

export default function LocalHostCard() {
  const router = useRouter();
  const [identity, setIdentity] = useState<LocalIdentity | null>(null);
  const [gpuName, setGpuName] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/api/hosts/identify')
      .then(res => {
        setIdentity(res.data);
      })
      .catch(err => {
        console.error('Failed to fetch local identity:', err);
      });

    apiClient
      .get('/api/gpu')
      .then(res => {
        const gpus = res.data.gpus || [];
        if (gpus.length > 0) {
          setGpuName(gpus[0].name);
        }
      })
      .catch(err => {
        console.error('Failed to fetch local GPU info:', err);
      });
  }, []);

  return (
    <div
      onClick={() => router.push('/hosts/local')}
      className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 border border-zinc-200 dark:border-zinc-800 cursor-pointer"
    >
      {/* Header */}
      <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <Monitor className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {identity?.hostname || 'This Machine'}
          </h2>
          <span className="w-2 h-2 rounded-full shrink-0 bg-green-500" />
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div className="flex items-center space-x-2">
          <Wifi className="w-4 h-4 text-green-500" />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">localhost:{identity?.port || 8675}</span>
        </div>

        <div className="flex items-center space-x-2">
          <Badge color="emerald">Local</Badge>
          {identity?.deviceType && (
            <Badge color={getDeviceBadgeColor(identity.deviceType)}>{identity.deviceType.toUpperCase()}</Badge>
          )}
        </div>

        {gpuName && <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{gpuName}</p>}
      </div>
    </div>
  );
}
