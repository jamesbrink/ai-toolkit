'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { SourcedDatasetInfo, DataSource, DatasetGroup } from '@/types';
import { HostInfo } from '@/hooks/useHostList';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';

/**
 * Group flat dataset instances by name into DatasetGroups.
 * Exported for testing — pure function, no side effects.
 */
export function groupDatasets(datasets: SourcedDatasetInfo[]): {
  groupedDatasets: DatasetGroup[];
  flatDatasets: SourcedDatasetInfo[];
} {
  const byName = new Map<string, SourcedDatasetInfo[]>();
  for (const ds of datasets) {
    const list = byName.get(ds.name) || [];
    list.push(ds);
    byName.set(ds.name, list);
  }

  const groups: DatasetGroup[] = [];
  for (const [name, instances] of byName) {
    const group: DatasetGroup = { name, instances, syncStatus: 'unknown' };

    if (instances.length === 1) {
      const isLocal = instances[0].source.type === 'local';
      group.syncStatus = isLocal ? 'local_only' : 'remote_only';
    } else {
      // Check if all instances have identical counts + size
      const first = instances[0];
      const allMatch = instances.every(
        i =>
          i.imageCount === first.imageCount &&
          i.captionCount === first.captionCount &&
          i.totalSizeBytes === first.totalSizeBytes,
      );

      if (allMatch) {
        group.syncStatus = 'synced';
      } else {
        group.syncStatus = 'diverged';
        group.hintText = generateHintText(instances);
      }
    }

    groups.push(group);
  }

  groups.sort((a, b) => a.name.localeCompare(b.name));
  return { groupedDatasets: groups, flatDatasets: datasets };
}

function generateHintText(instances: SourcedDatasetInfo[]): string {
  // Find the local instance (or first instance as reference)
  const local = instances.find(i => i.source.type === 'local') || instances[0];
  const hints: string[] = [];

  for (const inst of instances) {
    if (inst === local) continue;
    const hostName = inst.source.hostName || 'Remote';

    const imgDiff = inst.imageCount - local.imageCount;
    if (imgDiff !== 0) {
      const sign = imgDiff > 0 ? '+' : '';
      hints.push(`${sign}${imgDiff} images on ${hostName}`);
    } else {
      const capDiff = inst.captionCount - local.captionCount;
      if (capDiff !== 0) {
        const sign = capDiff > 0 ? '+' : '';
        hints.push(`${sign}${capDiff} captions on ${hostName}`);
      } else if (inst.totalSizeBytes !== local.totalSizeBytes) {
        hints.push(`Size differs on ${hostName}`);
      }
    }
  }

  return hints.join('; ') || 'Content differs';
}

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
          datasets: (res.data || []) as Record<string, unknown>[],
        })),
        ...onlineHosts.map(host =>
          remoteApi.get(host.id, 'datasets/list').then(res => ({
            source: { type: 'remote' as const, hostId: host.id, hostName: host.name, isOnline: true },
            datasets: (res.data || []) as Record<string, unknown>[],
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
              name: ds.name as string,
              imageCount: (ds.imageCount as number) ?? 0,
              captionCount: (ds.captionCount as number) ?? 0,
              totalSizeBytes: (ds.totalSizeBytes as number) ?? 0,
              lastModified: (ds.lastModified as number | null) ?? null,
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
