'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { UnifiedJob, DataSource } from '@/types';
import { HostInfo } from '@/hooks/useHostList';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';

const LOCAL_SOURCE: DataSource = { type: 'local' };

function normalizeJob(raw: any, source: DataSource): UnifiedJob {
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    step: raw.step ?? 0,
    speed_string: raw.speed_string ?? '',
    gpu_ids: raw.gpu_ids ?? '',
    job_config: raw.job_config ?? '{}',
    queue_position: raw.queue_position ?? null,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : new Date(raw.created_at).toISOString(),
    info: raw.info ?? '',
    stop: raw.stop ?? false,
    return_to_queue: raw.return_to_queue ?? false,
    source,
  };
}

export default function useAllJobs(hosts: HostInfo[], onlyActive = false, reloadInterval = 5000) {
  const [allJobs, setAllJobs] = useState<UnifiedJob[]>([]);
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
        apiClient.get('/api/jobs').then(res => ({
          source: LOCAL_SOURCE,
          jobs: (res.data.jobs || []) as any[],
        })),
        ...onlineHosts.map(host =>
          remoteApi.get(host.id, 'jobs').then(res => ({
            source: { type: 'remote' as const, hostId: host.id, hostName: host.name, isOnline: true },
            jobs: (res.data.jobs || []) as any[],
          })),
        ),
      ];

      const results = await Promise.allSettled(promises);
      const merged: UnifiedJob[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { source, jobs } = result.value;
          for (const job of jobs) {
            merged.push(normalizeJob(job, source));
          }
        }
      }

      const filtered = onlyActive ? merged.filter(j => ['running', 'queued', 'stopping'].includes(j.status)) : merged;

      setAllJobs(filtered);
    } catch (err) {
      console.error('useAllJobs fetch error:', err);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [onlyActive]);

  const refreshAllJobs = useCallback(() => {
    isFetchingRef.current = false;
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, reloadInterval);
    return () => clearInterval(interval);
  }, [fetchAll, reloadInterval]);

  return { allJobs, isLoading, refreshAllJobs };
}
