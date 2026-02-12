'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { remoteApi } from '@/utils/remoteApi';

export interface RemoteJob {
  id: string;
  name: string;
  status: string;
  step: number;
  speed_string: string;
  gpu_ids: string;
  job_config: string;
  queue_position: number | null;
  created_at: string;
  info: string;
  stop: boolean;
  return_to_queue: boolean;
}

export default function useRemoteJobs(hostId: string | null, reloadInterval: number | null = 5000) {
  const [jobs, setJobs] = useState<RemoteJob[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const didInitialLoadRef = useRef(false);

  const fetchJobs = useCallback(async () => {
    if (!hostId) return;
    if (!didInitialLoadRef.current) {
      setStatus('loading');
    }
    try {
      const res = await remoteApi.get(hostId, 'jobs');
      const data: RemoteJob[] = res.data.jobs || [];
      setJobs(data);
      setStatus('success');
      didInitialLoadRef.current = true;
    } catch (err) {
      console.error(`Failed to fetch remote jobs: ${err instanceof Error ? err.message : String(err)}`);
      if (!didInitialLoadRef.current) {
        setStatus('error');
      }
    }
  }, [hostId]);

  useEffect(() => {
    if (!hostId) {
      setJobs([]);
      setStatus('idle');
      didInitialLoadRef.current = false;
      return;
    }
    didInitialLoadRef.current = false;
    fetchJobs();

    if (reloadInterval) {
      const interval = setInterval(fetchJobs, reloadInterval);
      return () => clearInterval(interval);
    }
  }, [fetchJobs, reloadInterval, hostId]);

  const activeJob = jobs.find(j => j.status === 'running') || jobs.find(j => j.status === 'queued') || null;

  return { jobs, activeJob, status, refreshJobs: fetchJobs };
}
