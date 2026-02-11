'use client';

import { useState, useCallback } from 'react';

export interface AnalysisIssues {
  blurry: string[];
  dark: string[];
  bright: string[];
  tooSmall: string[];
  lowContrast: string[];
}

export interface DuplicateGroup {
  id: number;
  imagePaths: string[];
  maxSimilarity: number;
  dismissed: boolean;
}

export interface AnalysisSummary {
  duplicateGroupCount: number;
  blurryCount: number;
  darkCount: number;
  brightCount: number;
  tooSmallCount: number;
  lowContrastCount: number;
  facesCount: number;
  avgQualityScore: number;
}

export interface DatasetAnalysisResult {
  datasetName: string;
  totalImages: number;
  analyzedImages: number;
  duplicateGroups: DuplicateGroup[];
  issues: AnalysisIssues;
  summary: AnalysisSummary;
}

type AnalysisStatus = 'idle' | 'analyzing' | 'complete' | 'error';

export function useDatasetAnalysis(datasetName: string) {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [result, setResult] = useState<DatasetAnalysisResult | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const startAnalysis = useCallback(
    async (force?: boolean) => {
      setStatus('analyzing');
      setProgress({ current: 0, total: 0 });
      setError(null);

      try {
        const token = localStorage.getItem('AI_TOOLKIT_AUTH');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/datasets/analyze', {
          method: 'POST',
          headers,
          body: JSON.stringify({ datasetName, force }),
        });

        if (!res.ok) {
          throw new Error(`Analysis failed: ${res.statusText}`);
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
                setProgress({ current: data.current, total: data.total });
              } else if (data.type === 'complete') {
                setResult(data.result);
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

        // If we didn't get a complete event, check remaining buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer.trim());
            if (data.type === 'complete') {
              setResult(data.result);
              setStatus('complete');
            }
          } catch {
            // ignore
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStatus('error');
      }
    },
    [datasetName],
  );

  const getStoredResults = useCallback(async () => {
    try {
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/datasets/analysis', {
        method: 'POST',
        headers,
        body: JSON.stringify({ datasetName }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setStatus('complete');
        return data as DatasetAnalysisResult;
      }
      return null;
    } catch {
      return null;
    }
  }, [datasetName]);

  const dismissGroup = useCallback(async (groupId: number) => {
    try {
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/datasets/analysis/dismiss-group', {
        method: 'POST',
        headers,
        body: JSON.stringify({ groupId }),
      });

      // Update local state
      setResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          duplicateGroups: prev.duplicateGroups.map(g => (g.id === groupId ? { ...g, dismissed: true } : g)),
          summary: {
            ...prev.summary,
            duplicateGroupCount: prev.summary.duplicateGroupCount - 1,
          },
        };
      });
    } catch (err) {
      console.error('Failed to dismiss group:', err);
    }
  }, []);

  const dismissAllGroups = useCallback(async () => {
    setResult(prev => {
      if (!prev) return prev;
      const activeGroups = prev.duplicateGroups.filter(g => !g.dismissed);
      if (activeGroups.length === 0) return prev;

      // Fire off all dismiss requests in parallel (fast boolean flips)
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      for (const g of activeGroups) {
        fetch('/api/datasets/analysis/dismiss-group', {
          method: 'POST',
          headers,
          body: JSON.stringify({ groupId: g.id }),
        }).catch(err => console.error('Failed to dismiss group:', err));
      }

      return {
        ...prev,
        duplicateGroups: prev.duplicateGroups.map(g => ({ ...g, dismissed: true })),
        summary: { ...prev.summary, duplicateGroupCount: 0 },
      };
    });
  }, []);

  const deleteImages = useCallback(async (imagePaths: string[]) => {
    try {
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/datasets/analysis/delete-images', {
        method: 'POST',
        headers,
        body: JSON.stringify({ imagePaths }),
      });

      const data = await res.json();
      const deletedSet = new Set(data.deleted as string[]);

      // Update local state to remove deleted images
      setResult(prev => {
        if (!prev) return prev;
        const updatedGroups = prev.duplicateGroups
          .map(g => ({
            ...g,
            imagePaths: g.imagePaths.filter(p => !deletedSet.has(p)),
          }))
          .filter(g => g.imagePaths.length > 1);

        return {
          ...prev,
          totalImages: prev.totalImages - deletedSet.size,
          analyzedImages: prev.analyzedImages - deletedSet.size,
          duplicateGroups: updatedGroups,
          issues: {
            blurry: prev.issues.blurry.filter(p => !deletedSet.has(p)),
            dark: prev.issues.dark.filter(p => !deletedSet.has(p)),
            bright: prev.issues.bright.filter(p => !deletedSet.has(p)),
            tooSmall: prev.issues.tooSmall.filter(p => !deletedSet.has(p)),
            lowContrast: prev.issues.lowContrast.filter(p => !deletedSet.has(p)),
          },
          summary: {
            ...prev.summary,
            duplicateGroupCount: updatedGroups.filter(g => !g.dismissed).length,
            blurryCount: prev.issues.blurry.filter(p => !deletedSet.has(p)).length,
            darkCount: prev.issues.dark.filter(p => !deletedSet.has(p)).length,
            brightCount: prev.issues.bright.filter(p => !deletedSet.has(p)).length,
            tooSmallCount: prev.issues.tooSmall.filter(p => !deletedSet.has(p)).length,
            lowContrastCount: prev.issues.lowContrast.filter(p => !deletedSet.has(p)).length,
          },
        };
      });

      return data as { deleted: string[]; errors: string[] };
    } catch (err) {
      console.error('Failed to delete images:', err);
      return { deleted: [], errors: [String(err)] };
    }
  }, []);

  const cropFaces = useCallback(
    async (
      opts: {
        outputDatasetName?: string;
        trainingResolution?: number;
        padding?: number;
      } = {},
    ) => {
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/datasets/face-crop', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          datasetName,
          outputDatasetName: opts.outputDatasetName,
          trainingResolution: opts.trainingResolution,
          padding: opts.padding,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Face crop failed');
      }

      // Stream NDJSON progress
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let summary: Record<string, unknown> | null = null;

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
              setProgress({ current: data.current, total: data.total });
            } else if (data.type === 'summary') {
              summary = data;
            }
          } catch {
            /* skip */
          }
        }
      }

      return summary;
    },
    [datasetName],
  );

  const exportDataset = useCallback(
    async (includeCaptions: boolean = true) => {
      const token = localStorage.getItem('AI_TOOLKIT_AUTH');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/datasets/export', {
        method: 'POST',
        headers,
        body: JSON.stringify({ datasetName, includeCaptions }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Export failed');
      }

      return (await res.json()) as { zipPath: string; fileName: string };
    },
    [datasetName],
  );

  return {
    status,
    result,
    progress,
    error,
    startAnalysis,
    getStoredResults,
    dismissGroup,
    dismissAllGroups,
    deleteImages,
    cropFaces,
    exportDataset,
  };
}
