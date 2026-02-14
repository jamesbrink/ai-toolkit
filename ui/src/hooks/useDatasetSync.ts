'use client';

import { useState, useCallback } from 'react';
import type { ManifestDiff, SyncAction } from '@/types';

export type SyncStatus = 'idle' | 'comparing' | 'ready' | 'syncing' | 'complete' | 'error';

interface SyncProgress {
  completed: number;
  total: number;
  currentFile: string;
  action: string;
}

interface SyncResult {
  completed: number;
  errors: string[];
}

export default function useDatasetSync() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [diff, setDiff] = useState<ManifestDiff | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(async (datasetName: string, hostId: string, rich?: boolean) => {
    setStatus('comparing');
    setDiff(null);
    setError(null);
    setResult(null);

    try {
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/datasets/compare', {
        method: 'POST',
        headers,
        body: JSON.stringify({ datasetName, hostId, rich }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Compare failed' }));
        throw new Error(data.error || 'Compare failed');
      }

      const diffResult = (await res.json()) as ManifestDiff;
      setDiff(diffResult);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  const sync = useCallback(async (datasetName: string, hostId: string, actions: SyncAction[]) => {
    setStatus('syncing');
    setProgress(null);
    setResult(null);
    setError(null);

    try {
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/datasets/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ datasetName, hostId, actions }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Sync failed' }));
        throw new Error(data.error || 'Sync failed');
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
                completed: data.completed,
                total: data.total,
                currentFile: data.currentFile || '',
                action: data.action || '',
              });
            } else if (data.type === 'complete') {
              setResult({ completed: data.completed, errors: data.errors || [] });
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

      // Check final buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer.trim());
          if (data.type === 'complete') {
            setResult({ completed: data.completed, errors: data.errors || [] });
            setStatus('complete');
          }
        } catch {
          // skip
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  const mergeCaption = useCallback(async (localCaption: string, remoteCaption: string): Promise<string | null> => {
    try {
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/datasets/sync/merge-caption', {
        method: 'POST',
        headers,
        body: JSON.stringify({ localCaption, remoteCaption }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.mergedCaption || null;
    } catch {
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setDiff(null);
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return { status, diff, progress, result, error, compare, sync, mergeCaption, reset };
}
