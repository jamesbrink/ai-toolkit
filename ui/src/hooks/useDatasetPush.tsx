'use client';

import { useState, useCallback } from 'react';

interface PushProgress {
  transferred: number;
  total: number;
  currentFile: string;
}

type PushStatus = 'idle' | 'pushing' | 'complete' | 'error';

export function useDatasetPush() {
  const [status, setStatus] = useState<PushStatus>('idle');
  const [progress, setProgress] = useState<PushProgress>({ transferred: 0, total: 0, currentFile: '' });
  const [error, setError] = useState<string | null>(null);

  const startPush = useCallback(async (datasetName: string, hostId: string) => {
    setStatus('pushing');
    setProgress({ transferred: 0, total: 0, currentFile: '' });
    setError(null);

    try {
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/datasets/push', {
        method: 'POST',
        headers,
        body: JSON.stringify({ datasetName, hostId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errData.error || 'Push failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.type === 'progress') {
              setProgress({
                transferred: data.transferred,
                total: data.total,
                currentFile: data.currentFile || '',
              });
            } else if (data.type === 'complete') {
              setProgress(prev => ({ ...prev, transferred: data.transferred }));
              setStatus('complete');
            } else if (data.type === 'error') {
              setError(data.error);
              setStatus('error');
            }
          } catch {
            // skip invalid JSON
          }
        }
      }

      // Check remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer.trim());
          if (data.type === 'complete') {
            setProgress(prev => ({ ...prev, transferred: data.transferred }));
            setStatus('complete');
          } else if (data.type === 'error') {
            setError(data.error);
            setStatus('error');
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress({ transferred: 0, total: 0, currentFile: '' });
    setError(null);
  }, []);

  return { status, progress, error, startPush, reset };
}
