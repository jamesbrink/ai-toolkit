'use client';

import { useEffect, useState, useRef } from 'react';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';

interface FileObject {
  path: string;
  size: number;
}

export default function useFilesList(jobID: string, reloadInterval: null | number = null, hostId?: string | null) {
  const [files, setFiles] = useState<FileObject[]>([]);
  const didInitialLoadRef = useRef(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'refreshing'>('idle');

  const refreshFiles = () => {
    let loadStatus: 'loading' | 'refreshing' = 'loading';
    if (didInitialLoadRef.current) {
      loadStatus = 'refreshing';
    }
    setStatus(loadStatus);
    const request = hostId ? remoteApi.get(hostId, `jobs/${jobID}/files`) : apiClient.get(`/api/jobs/${jobID}/files`);
    request
      .then(res => res.data)
      .then(data => {
        if (data.files) {
          setFiles(data.files);
        }
        setStatus('success');
        didInitialLoadRef.current = true;
      })
      .catch(error => {
        console.error('Error fetching files:', error);
        setStatus('error');
      });
  };

  useEffect(() => {
    didInitialLoadRef.current = false;
    refreshFiles();

    if (reloadInterval) {
      const interval = setInterval(() => {
        refreshFiles();
      }, reloadInterval);

      return () => {
        clearInterval(interval);
      };
    }
  }, [jobID, hostId]);

  return { files, setFiles, status, refreshFiles };
}
