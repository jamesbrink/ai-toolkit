'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { UnifiedQueue, DataSource } from '@/types';
import { HostInfo } from '@/hooks/useHostList';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';

const LOCAL_SOURCE: DataSource = { type: 'local' };

function normalizeQueue(raw: any, source: DataSource): UnifiedQueue {
  return {
    id: raw.id,
    gpu_ids: raw.gpu_ids ?? '',
    is_running: raw.is_running ?? false,
    source,
  };
}

export default function useAllQueues(hosts: HostInfo[], reloadInterval = 5000) {
  const [allQueues, setAllQueues] = useState<UnifiedQueue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const hostsRef = useRef(hosts);
  hostsRef.current = hosts;

  const fetchAll = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const onlineHosts = hostsRef.current.filter(h => h.isOnline);

      const promises = [
        apiClient.get('/api/queue').then(res => ({
          source: LOCAL_SOURCE,
          queues: (res.data.queues || []) as any[],
        })),
        ...onlineHosts.map(host =>
          remoteApi.get(host.id, 'queue').then(res => ({
            source: { type: 'remote' as const, hostId: host.id, hostName: host.name, isOnline: true },
            queues: (res.data.queues || []) as any[],
          })),
        ),
      ];

      const results = await Promise.allSettled(promises);
      const merged: UnifiedQueue[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { source, queues } = result.value;
          for (const q of queues) {
            merged.push(normalizeQueue(q, source));
          }
        }
      }

      setAllQueues(merged);
    } catch (err) {
      console.error('useAllQueues fetch error:', err);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  const refreshAllQueues = useCallback(() => {
    isFetchingRef.current = false;
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, reloadInterval);
    return () => clearInterval(interval);
  }, [fetchAll, reloadInterval]);

  return { allQueues, isLoading, refreshAllQueues };
}
