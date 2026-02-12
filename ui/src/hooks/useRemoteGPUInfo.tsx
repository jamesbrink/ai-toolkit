'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { GPUApiResponse, GpuInfo, DeviceType } from '@/types';
import { remoteApi } from '@/utils/remoteApi';

export default function useRemoteGPUInfo(hostId: string | null, reloadInterval: number | null = 3000) {
  const [gpuList, setGpuList] = useState<GpuInfo[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [deviceType, setDeviceType] = useState<DeviceType>('none');
  const didInitialLoadRef = useRef(false);

  const fetchGpuInfo = useCallback(async () => {
    if (!hostId) return;
    if (!didInitialLoadRef.current) {
      setStatus('loading');
    }
    try {
      const data: GPUApiResponse = await remoteApi.get(hostId, 'gpu').then(res => res.data);
      setDeviceType(data.deviceType || (data.hasNvidiaSmi ? 'nvidia' : 'none'));
      const gpus = data.gpus.sort((a, b) => a.index - b.index);
      setGpuList(gpus);
      setStatus('success');
      didInitialLoadRef.current = true;
    } catch (err) {
      console.error(`Failed to fetch remote GPU data: ${err instanceof Error ? err.message : String(err)}`);
      if (!didInitialLoadRef.current) {
        setStatus('error');
      }
    } finally {
      setIsLoaded(true);
    }
  }, [hostId]);

  useEffect(() => {
    if (!hostId) return;
    didInitialLoadRef.current = false;
    setIsLoaded(false);
    fetchGpuInfo();

    if (reloadInterval) {
      const interval = setInterval(() => {
        fetchGpuInfo();
      }, reloadInterval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [fetchGpuInfo, reloadInterval, hostId]);

  return { gpuList, isLoaded, status, deviceType, refreshGpuInfo: fetchGpuInfo };
}
