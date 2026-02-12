'use client';

import { CpuInfo } from '@/types';
import { useEffect, useState, useRef } from 'react';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';

export default function useCPUInfo(reloadInterval: null | number = null, hostId?: string | null) {
  const [cpuInfo, setCpuInfo] = useState<CpuInfo | null>(null);
  const [isCPUInfoLoaded, setIsLoaded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const didInitialLoadRef = useRef(false);

  const fetchCpuInfo = async () => {
    if (!didInitialLoadRef.current) {
      setStatus('loading');
    }
    try {
      const request = hostId
        ? remoteApi.get(hostId, 'cpu')
        : apiClient.get('/api/cpu');
      const data: CpuInfo = await request.then(res => res.data);
      setCpuInfo(data);
      setStatus('success');
      didInitialLoadRef.current = true;
    } catch (err) {
      console.error(`Failed to fetch CPU data: ${err instanceof Error ? err.message : String(err)}`);
      if (!didInitialLoadRef.current) {
        setStatus('error');
      }
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    didInitialLoadRef.current = false;
    fetchCpuInfo();

    if (reloadInterval) {
      const interval = setInterval(() => {
        fetchCpuInfo();
      }, reloadInterval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [reloadInterval, hostId]);

  return { cpuInfo, isCPUInfoLoaded, status, refreshCpuInfo: fetchCpuInfo };
}
