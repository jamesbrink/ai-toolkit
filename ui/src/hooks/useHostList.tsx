'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/utils/api';

export interface HostInfo {
  id: string;
  name: string;
  address: string;
  port: number;
  instanceId: string;
  source: string;
  isOnline: boolean;
  deviceType: string;
  gpuSummary: string;
  canReachBack: boolean;
  lastSeen: string;
}

export default function useHostList(reloadInterval: number | null = 10000) {
  const [hosts, setHosts] = useState<HostInfo[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const refreshHosts = async () => {
    setStatus('loading');
    try {
      const res = await apiClient.get('/api/hosts');
      const data = res.data.hosts || res.data;
      setHosts(data);
      setStatus('success');
    } catch (err) {
      console.error(`Failed to fetch hosts: ${err instanceof Error ? err.message : String(err)}`);
      setStatus('error');
    }
  };

  useEffect(() => {
    refreshHosts();

    if (reloadInterval) {
      const interval = setInterval(() => {
        refreshHosts();
      }, reloadInterval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [reloadInterval]);

  return { hosts, status, refreshHosts };
}
