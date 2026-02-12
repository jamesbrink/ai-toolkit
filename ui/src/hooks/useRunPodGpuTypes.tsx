'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/utils/api';

export interface GpuTypeInfo {
  id: string;
  displayName: string;
  memoryInGb: number;
  secureCloud: boolean;
  communityCloud: boolean;
  lowestPrice: {
    minimumBidPrice: number;
    uninterruptablePrice: number;
    stockStatus: string;
  } | null;
}

export default function useRunPodGpuTypes(enabled = true) {
  const [gpuTypes, setGpuTypes] = useState<GpuTypeInfo[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!enabled) return;
    setStatus('loading');
    apiClient
      .get('/api/runpod/gpu-types')
      .then(res => {
        setGpuTypes(res.data.gpuTypes || []);
        setStatus('success');
      })
      .catch(err => {
        console.error(`Failed to fetch GPU types: ${err instanceof Error ? err.message : String(err)}`);
        setStatus('error');
      });
  }, [enabled]);

  return { gpuTypes, status };
}
