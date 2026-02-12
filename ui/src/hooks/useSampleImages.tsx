'use client';

import { useEffect, useState, useRef } from 'react';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';

export default function useSampleImages(jobID: string, reloadInterval: null | number = null, hostId?: string | null) {
  const [sampleImages, setSampleImages] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const didInitialLoadRef = useRef(false);

  const refreshSampleImages = () => {
    if (!didInitialLoadRef.current) {
      setStatus('loading');
    }
    const request = hostId
      ? remoteApi.get(hostId, `jobs/${jobID}/samples`)
      : apiClient.get(`/api/jobs/${jobID}/samples`);
    request
      .then(res => res.data)
      .then(data => {
        if (data.samples) {
          setSampleImages(data.samples);
        }
        setStatus('success');
        didInitialLoadRef.current = true;
      })
      .catch(error => {
        console.error('Error fetching samples:', error);
        if (!didInitialLoadRef.current) {
          setStatus('error');
        }
      });
  };

  useEffect(() => {
    didInitialLoadRef.current = false;
    refreshSampleImages();

    if (reloadInterval) {
      const interval = setInterval(() => {
        refreshSampleImages();
      }, reloadInterval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [jobID, hostId]);

  return { sampleImages, setSampleImages, status, refreshSampleImages };
}
