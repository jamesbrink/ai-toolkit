'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { SourcedDatasetInfo, DataSource } from '@/types';
import { HostInfo } from '@/hooks/useHostList';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';

const LOCAL_SOURCE: DataSource = { type: 'local' };

export default function useAllDatasets(hosts: HostInfo[]) {
  const [allDatasets, setAllDatasets] = useState<SourcedDatasetInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const refetchRequestedRef = useRef(false);
  const hostsRef = useRef(hosts);
  hostsRef.current = hosts;

  // Stable key that changes only when the set of online hosts changes
  const onlineHostsKey = useMemo(
    () =>
      hosts
        .filter(h => h.isOnline)
        .map(h => h.id)
        .sort()
        .join(','),
    [hosts],
  );

  const fetchAll = useCallback(async () => {
    if (isFetchingRef.current) {
      // A fetch is already running — flag that we need to re-fetch when it finishes
      // (e.g. hosts changed while the initial local-only fetch was in-flight)
      refetchRequestedRef.current = true;
      return;
    }
    isFetchingRef.current = true;
    refetchRequestedRef.current = false;

    try {
      const onlineHosts = hostsRef.current.filter(h => h.isOnline);

      const promises = [
        apiClient.get('/api/datasets/list').then(res => ({
          source: LOCAL_SOURCE,
          datasets: (res.data || []) as any[],
        })),
        ...onlineHosts.map(host =>
          remoteApi.get(host.id, 'datasets/list').then(res => ({
            source: { type: 'remote' as const, hostId: host.id, hostName: host.name, isOnline: true },
            datasets: (res.data || []) as any[],
          })),
        ),
      ];

      const results = await Promise.allSettled(promises);
      const merged: SourcedDatasetInfo[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { source, datasets } = result.value;
          for (const ds of datasets) {
            merged.push({
              name: ds.name,
              imageCount: ds.imageCount ?? 0,
              captionCount: ds.captionCount ?? 0,
              totalSizeBytes: ds.totalSizeBytes ?? 0,
              lastModified: ds.lastModified ?? null,
              source,
            });
          }
        }
      }

      setAllDatasets(merged);
    } catch (err) {
      console.error('useAllDatasets fetch error:', err);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);

      // If hosts changed while we were fetching, re-fetch with the updated host list
      if (refetchRequestedRef.current) {
        refetchRequestedRef.current = false;
        fetchAll();
      }
    }
  }, []);

  const refreshAllDatasets = useCallback(() => {
    isFetchingRef.current = false;
    refetchRequestedRef.current = false;
    fetchAll();
  }, [fetchAll]);

  // Re-fetch when the set of online hosts changes (covers initial load + host status changes)
  useEffect(() => {
    fetchAll();
  }, [fetchAll, onlineHostsKey]);

  return { allDatasets, isLoading, refreshAllDatasets };
}
