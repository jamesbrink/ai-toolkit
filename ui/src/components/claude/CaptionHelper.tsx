'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { X, Check, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/catalyst/button';
import { apiClient } from '@/utils/api';
import { getImageUrlPrefix } from '@/utils/remoteApi';
import { proxyApiPath } from '@/utils/proxyPath';

interface CaptionResult {
  imagePath: string;
  caption: string;
  oldCaption?: string;
  accepted?: boolean;
  error?: string;
}

interface CaptionHelperProps {
  isOpen: boolean;
  onClose: () => void;
  imagePaths: string[];
  datasetName: string;
  onCaptionsApplied?: () => void;
  hostId?: string | null;
}

export default function CaptionHelper({
  isOpen,
  onClose,
  imagePaths,
  datasetName,
  onCaptionsApplied,
  hostId,
}: CaptionHelperProps) {
  const [style, setStyle] = useState<'descriptive' | 'booru' | 'natural' | 'trigger'>('descriptive');
  const [triggerWord, setTriggerWord] = useState('');
  const [results, setResults] = useState<CaptionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const startBatchCaption = useCallback(async () => {
    setIsProcessing(true);
    setResults([]);
    setProgress({ current: 0, total: imagePaths.length });

    // First, fetch existing captions for comparison
    const existingCaptions: Record<string, string> = {};
    for (const imgPath of imagePaths) {
      try {
        const res = await apiClient.post(proxyApiPath('/api/caption/get', hostId), { imgPath });
        if (res.data) {
          existingCaptions[imgPath] = `${res.data}`;
        }
      } catch {
        // no existing caption
      }
    }

    const token = localStorage.getItem('AI_TOOLKIT_AUTH');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/claude/caption/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        imagePaths,
        style,
        ...(style === 'trigger' && triggerWord ? { triggerWord } : {}),
        ...(hostId ? { hostId } : {}),
      }),
    });

    if (!res.ok) {
      setIsProcessing(false);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      setIsProcessing(false);
      return;
    }

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
          setProgress({ current: data.index + 1, total: data.total });
          setResults(prev => [
            ...prev,
            {
              imagePath: data.imagePath,
              caption: data.caption,
              oldCaption: existingCaptions[data.imagePath] || '',
              error: data.error,
            },
          ]);
        } catch {
          // skip
        }
      }
    }

    setIsProcessing(false);
  }, [imagePaths, style, triggerWord, hostId]);

  const toggleAccept = (index: number) => {
    setResults(prev => prev.map((r, i) => (i === index ? { ...r, accepted: !r.accepted } : r)));
  };

  const acceptAll = () => {
    setResults(prev => prev.map(r => (r.error ? r : { ...r, accepted: true })));
  };

  const [isSaving, setIsSaving] = useState(false);

  const applyCaptions = async (items: CaptionResult[]) => {
    setIsSaving(true);
    for (const result of items) {
      try {
        await apiClient.post(proxyApiPath('/api/img/caption', hostId), {
          imgPath: result.imagePath,
          caption: result.caption.trim(),
        });
      } catch (err) {
        console.error('Failed to save caption:', err);
      }
    }
    setIsSaving(false);
    onCaptionsApplied?.();
    onClose();
  };

  const applyAccepted = () => {
    applyCaptions(results.filter(r => r.accepted && !r.error));
  };

  const applyAll = () => {
    const all = results.filter(r => !r.error && r.caption);
    setResults(prev => prev.map(r => (!r.error && r.caption ? { ...r, accepted: true } : r)));
    applyCaptions(all);
  };

  const acceptedCount = results.filter(r => r.accepted).length;
  const appliableCount = results.filter(r => !r.error && r.caption).length;

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-4xl max-h-[85vh] bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
            <DialogTitle className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              Caption with Claude — {datasetName}
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Style selector */}
            {!isProcessing && results.length === 0 && (
              <div className="space-y-3">
                <label className="block text-sm text-zinc-700 dark:text-zinc-300">Caption style</label>
                <div className="flex flex-wrap gap-2">
                  {(['descriptive', 'booru', 'natural', 'trigger'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        style === s
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                          : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                {style === 'trigger' && (
                  <div className="space-y-1">
                    <label className="block text-xs text-zinc-500 dark:text-zinc-400">Trigger word</label>
                    <input
                      type="text"
                      value={triggerWord}
                      onChange={e => setTriggerWord(e.target.value)}
                      placeholder="e.g. ohwx"
                      className="w-48 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 placeholder-zinc-400 dark:placeholder-zinc-500 border border-zinc-300 dark:border-zinc-700"
                    />
                  </div>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {imagePaths.length} image{imagePaths.length !== 1 ? 's' : ''} selected
                </p>
                <Button color="blue" onClick={startBatchCaption} disabled={style === 'trigger' && !triggerWord.trim()}>
                  Generate Captions
                </Button>
              </div>
            )}

            {/* Progress */}
            {isProcessing && (
              <div className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing {progress.current} of {progress.total}...
              </div>
            )}

            {/* Results */}
            {results.length > 0 && (
              <div className="space-y-3">
                {!isProcessing && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={acceptAll}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                    >
                      Accept all
                    </button>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {acceptedCount} of {results.length} accepted
                    </span>
                  </div>
                )}
                {results.map((result, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 text-sm ${
                      result.accepted
                        ? 'border-green-600 dark:border-green-700 bg-green-50 dark:bg-green-950/20'
                        : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic API-served dataset image */}
                      <img
                        src={`${getImageUrlPrefix(hostId)}${encodeURIComponent(result.imagePath)}`}
                        alt=""
                        className="w-16 h-16 object-cover rounded shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        {result.error ? (
                          <p className="text-red-600 dark:text-red-400 text-xs">{result.error}</p>
                        ) : (
                          <>
                            {result.oldCaption && (
                              <div>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">Old: </span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400 line-through">
                                  {result.oldCaption}
                                </span>
                              </div>
                            )}
                            <div>
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">New: </span>
                              <span className="text-xs text-zinc-800 dark:text-zinc-200">{result.caption}</span>
                            </div>
                          </>
                        )}
                      </div>
                      {!result.error && (
                        <button
                          onClick={() => toggleAccept(i)}
                          className={`p-1.5 rounded shrink-0 transition-colors ${
                            result.accepted
                              ? 'bg-green-600 dark:bg-green-700 text-white'
                              : 'text-zinc-500 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-400'
                          }`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {results.length > 0 && !isProcessing && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-200 dark:border-zinc-700 shrink-0">
              <Button
                plain
                onClick={() => {
                  setResults([]);
                  setProgress({ current: 0, total: 0 });
                }}
                disabled={isSaving}
              >
                <RotateCcw className="w-4 h-4" />
                Regenerate
              </Button>
              <div className="flex items-center gap-2">
                {isSaving && (
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving...
                  </span>
                )}
                <Button color="green" onClick={applyAccepted} disabled={acceptedCount === 0 || isSaving}>
                  Apply {acceptedCount} caption{acceptedCount !== 1 ? 's' : ''}
                </Button>
                <Button color="blue" onClick={applyAll} disabled={appliableCount === 0 || isSaving}>
                  Apply All ({appliableCount})
                </Button>
              </div>
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
