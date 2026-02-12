'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/utils/api';

export interface RunPodPodInfo {
  id: string;
  runpodId: string;
  name: string;
  gpuTypeId: string;
  gpuTypeDisplay: string;
  gpuCount: number;
  cloudType: string;
  volumeInGb: number;
  containerDiskInGb: number;
  costPerHr: number;
  desiredStatus: string;
  currentStatus: string;
  publicIp: string;
  publicPort: number;
  hostId: string | null;
  authPassword: string;
  startedAt: string | null;
  totalUptimeSeconds: number;
  estimatedSpend: number;
  createdAt: string;
  updatedAt: string;
  terminatedAt: string | null;
  lastPolledAt: string | null;
  errorMessage: string;
}

export default function useRunPodPods(reloadInterval: number | null = 5000) {
  const [pods, setPods] = useState<RunPodPodInfo[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const refreshPods = async () => {
    setStatus('loading');
    try {
      const res = await apiClient.get('/api/runpod/pods');
      setPods(res.data.pods || []);
      setStatus('success');
    } catch (err) {
      console.error(`Failed to fetch RunPod pods: ${err instanceof Error ? err.message : String(err)}`);
      setStatus('error');
    }
  };

  useEffect(() => {
    refreshPods();

    if (reloadInterval) {
      const interval = setInterval(() => {
        refreshPods();
      }, reloadInterval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [reloadInterval]);

  return { pods, status, refreshPods };
}
