'use client';

import { useEffect, useState } from 'react';
import { DatasetInfo } from './useDatasetList';
import { remoteApi } from '@/utils/remoteApi';

export default function useRemoteDatasetList(hostId: string | null) {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const refreshDatasets = () => {
    if (!hostId) return;
    setStatus('loading');
    remoteApi
      .get(hostId, 'datasets/list')
      .then(res => res.data)
      .then(data => {
        data.sort((a: DatasetInfo, b: DatasetInfo) => a.name.localeCompare(b.name));
        setDatasets(data);
        setStatus('success');
      })
      .catch(error => {
        console.error('Error fetching remote datasets:', error);
        setStatus('error');
      });
  };

  useEffect(() => {
    if (!hostId) {
      setDatasets([]);
      setStatus('idle');
      return;
    }
    refreshDatasets();
  }, [hostId]);

  return { datasets, status, refreshDatasets };
}
