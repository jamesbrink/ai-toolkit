'use client';

import { useEffect, useState } from 'react';
import { remoteApi } from '@/utils/remoteApi';

export interface RemoteJob {
  id: number;
  name: string;
  status: string;
  step: number;
  speed_string: string;
}

export default function useRemoteJobs(hostId: string | null, reloadInterval: number | null = 5000) {
  const [jobs, setJobs] = useState<RemoteJob[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const fetchJobs = async () => {
    if (!hostId) return;
    setStatus('loading');
    try {
      const data: RemoteJob[] = await remoteApi.get(hostId, 'jobs').then(res => res.data);
      setJobs(data);
      setStatus('success');
    } catch (err) {
      console.error(`Failed to fetch remote jobs: ${err instanceof Error ? err.message : String(err)}`);
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!hostId) return;
    fetchJobs();

    if (reloadInterval) {
      const interval = setInterval(() => {
        fetchJobs();
      }, reloadInterval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [hostId, reloadInterval]);

  return { jobs, status, refreshJobs: fetchJobs };
}
