'use client';

import { DeviceType, GPUApiResponse, GpuInfo } from '@/types';
import { useEffect, useState, useRef, useCallback } from 'react';
import { apiClient } from '@/utils/api';

export default function useGPUInfo(gpuIds: null | number[] = null, reloadInterval: null | number = null) {
  const [gpuList, setGpuList] = useState<GpuInfo[]>([]);
  const [isGPUInfoLoaded, setIsLoaded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [deviceType, setDeviceType] = useState<DeviceType>('none');
  const didInitialLoadRef = useRef(false);

  const fetchGpuInfo = useCallback(async () => {
    if (!didInitialLoadRef.current) {
      setStatus('loading');
    }
    try {
      const data: GPUApiResponse = await apiClient.get('/api/gpu').then(res => res.data);
      setDeviceType(data.deviceType || (data.hasNvidiaSmi ? 'nvidia' : 'none'));
      let gpus = data.gpus.sort((a, b) => a.index - b.index);
      if (gpuIds) {
        gpus = gpus.filter(gpu => gpuIds.includes(gpu.index));
      }
      setGpuList(gpus);
      setStatus('success');
      didInitialLoadRef.current = true;
    } catch (err) {
      console.error(`Failed to fetch GPU data: ${err instanceof Error ? err.message : String(err)}`);
      if (!didInitialLoadRef.current) {
        setStatus('error');
      }
    } finally {
      setIsLoaded(true);
    }
  }, [gpuIds]);

  useEffect(() => {
    didInitialLoadRef.current = false;
    fetchGpuInfo();

    if (reloadInterval) {
      const interval = setInterval(() => {
        fetchGpuInfo();
      }, reloadInterval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [fetchGpuInfo, reloadInterval]);

  return { gpuList, setGpuList, isGPUInfoLoaded, status, deviceType, refreshGpuInfo: fetchGpuInfo };
}
