'use client';

import { useEffect, useState } from 'react';
import { GPUApiResponse, GpuInfo, DeviceType } from '@/types';
import { remoteApi } from '@/utils/remoteApi';

export default function useRemoteGPUInfo(hostId: string | null, reloadInterval: number | null = 3000) {
  const [gpuList, setGpuList] = useState<GpuInfo[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [deviceType, setDeviceType] = useState<DeviceType>('none');

  const fetchGpuInfo = async () => {
    if (!hostId) return;
    setStatus('loading');
    try {
      const data: GPUApiResponse = await remoteApi.get(hostId, 'gpu').then(res => res.data);
      setDeviceType(data.deviceType || (data.hasNvidiaSmi ? 'nvidia' : 'none'));
      const gpus = data.gpus.sort((a, b) => a.index - b.index);
      setGpuList(gpus);
      setStatus('success');
    } catch (err) {
      console.error(`Failed to fetch remote GPU data: ${err instanceof Error ? err.message : String(err)}`);
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!hostId) return;
    fetchGpuInfo();

    if (reloadInterval) {
      const interval = setInterval(() => {
        fetchGpuInfo();
      }, reloadInterval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [hostId, reloadInterval]);

  return { gpuList, status, deviceType, refreshGpuInfo: fetchGpuInfo };
}
