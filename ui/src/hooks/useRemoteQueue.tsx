'use client';

import { useEffect, useState } from 'react';
import { remoteApi } from '@/utils/remoteApi';

export interface RemoteQueue {
  id: number;
  gpu_ids: string;
  is_running: boolean;
}

export default function useRemoteQueue(hostId: string | null) {
  const [queues, setQueues] = useState<RemoteQueue[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const fetchQueue = async () => {
    if (!hostId) return;
    setStatus('loading');
    try {
      const data: RemoteQueue[] = await remoteApi.get(hostId, 'queue').then(res => res.data);
      setQueues(data);
      setStatus('success');
    } catch (err) {
      console.error(`Failed to fetch remote queue: ${err instanceof Error ? err.message : String(err)}`);
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!hostId) return;
    fetchQueue();
  }, [hostId]);

  return { queues, status, refreshQueue: fetchQueue };
}
