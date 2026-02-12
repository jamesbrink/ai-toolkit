'use client';

import { useEffect, useState, useRef } from 'react';
import { Job } from '@/server/prismaTypes';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';

export default function useJob(jobID: string, reloadInterval: null | number = null, hostId?: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const didInitialLoadRef = useRef(false);

  const refreshJob = () => {
    if (!didInitialLoadRef.current) {
      setStatus('loading');
    }
    const request = hostId ? remoteApi.get(hostId, `jobs?id=${jobID}`) : apiClient.get(`/api/jobs?id=${jobID}`);
    request
      .then(res => res.data)
      .then(data => {
        setJob(data);
        setStatus('success');
        didInitialLoadRef.current = true;
      })
      .catch(error => {
        console.error('Error fetching job:', error);
        if (!didInitialLoadRef.current) {
          setStatus('error');
        }
      });
  };

  useEffect(() => {
    didInitialLoadRef.current = false;
    refreshJob();

    if (reloadInterval) {
      const interval = setInterval(() => {
        refreshJob();
      }, reloadInterval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [jobID, hostId]);

  return { job, setJob, status, refreshJob };
}
