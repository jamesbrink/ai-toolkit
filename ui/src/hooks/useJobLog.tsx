'use client';

import { useEffect, useState, useRef } from 'react';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';

interface FileObject {
  path: string;
  size: number;
}

const clean = (text: string): string => {
  // remove \x1B[A\x1B[A
  text = text.replace(/\x1B\[A/g, '');
  return text;
};

export default function useJobLog(jobID: string, reloadInterval: null | number = null, hostId?: string | null) {
  const [log, setLog] = useState<string>('');
  const didInitialLoadRef = useRef(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'refreshing'>('idle');

  const refresh = () => {
    let loadStatus: 'loading' | 'refreshing' = 'loading';
    if (didInitialLoadRef.current) {
      loadStatus = 'refreshing';
    }
    setStatus(loadStatus);
    const request = hostId ? remoteApi.get(hostId, `jobs/${jobID}/log`) : apiClient.get(`/api/jobs/${jobID}/log`);
    request
      .then(res => res.data)
      .then(data => {
        if (data.log) {
          const cleanLog = clean(data.log);
          setLog(cleanLog);
        }
        setStatus('success');
        didInitialLoadRef.current = true;
      })
      .catch(error => {
        console.error('Error fetching log:', error);
        setStatus('error');
      });
  };

  useEffect(() => {
    didInitialLoadRef.current = false;
    refresh();

    if (reloadInterval) {
      const interval = setInterval(() => {
        refresh();
      }, reloadInterval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [jobID, hostId]);

  return { log, setLog, status, refresh };
}
