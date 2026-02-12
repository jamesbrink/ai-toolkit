'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GPUApiResponse, SourcedGpuInfo, DataSource } from '@/types';
import { HostInfo } from '@/hooks/useHostList';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';

const LOCAL_SOURCE: DataSource = { type: 'local' };

export default function useAllGPUInfo(hosts: HostInfo[], reloadInterval = 3000) {
  const [allGpus, setAllGpus] = useState<SourcedGpuInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isFetchingRef = useRef(false);
  const hostsRef = useRef(hosts);
  hostsRef.current = hosts;

  const fetchAll = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const onlineHosts = hostsRef.current.filter(h => h.isOnline);

      const promises = [
        apiClient.get('/api/gpu').then(res => ({
          source: LOCAL_SOURCE,
          data: res.data as GPUApiResponse,
        })),
        ...onlineHosts.map(host =>
          remoteApi.get(host.id, 'gpu').then(res => ({
            source: { type: 'remote' as const, hostId: host.id, hostName: host.name, isOnline: true },
            data: res.data as GPUApiResponse,
          })),
        ),
      ];

      const results = await Promise.allSettled(promises);
      const merged: SourcedGpuInfo[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { source, data } = result.value;
          for (const gpu of data.gpus) {
            merged.push({ ...gpu, source });
          }
        }
      }

      setAllGpus(merged);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('useAllGPUInfo fetch error:', err);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, reloadInterval);
    return () => clearInterval(interval);
  }, [fetchAll, reloadInterval]);

  return { allGpus, isLoading, lastUpdated };
}
