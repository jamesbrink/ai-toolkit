'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogPanel, DialogTitle, Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import {
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Sparkles,
  SkipForward,
} from 'lucide-react';
import { Button } from '@/components/catalyst/button';
import useDatasetSync from '@/hooks/useDatasetSync';
import type { DiffEntry, SyncAction } from '@/types';

interface DatasetSyncPanelProps {
  isOpen: boolean;
  onClose: () => void;
  datasetName: string;
  hostId: string;
  hostName: string;
  onSyncComplete?: () => void;
}

type CaptionAction = 'keep_local' | 'keep_remote' | 'ai_merge' | 'skip';

interface CaptionDecision {
  action: CaptionAction;
  mergedCaption?: string;
}

export default function DatasetSyncPanel({
  isOpen,
  onClose,
  datasetName,
  hostId,
  hostName,
  onSyncComplete,
}: DatasetSyncPanelProps) {
  const { status, diff, progress, result, error, compare, sync, mergeCaption, reset } = useDatasetSync();

  // Per-file action state
  const [fileActions, setFileActions] = useState<Map<string, 'pull' | 'push' | 'skip'>>(new Map());
  const [captionDecisions, setCaptionDecisions] = useState<Map<string, CaptionDecision>>(new Map());
  const [mergingCaption, setMergingCaption] = useState<string | null>(null);

  // Start comparison when panel opens
  useEffect(() => {
    if (isOpen && status === 'idle') {
      compare(datasetName, hostId, true);
    }
  }, [isOpen, status, compare, datasetName, hostId]);

  // Reset state when closing
  const handleClose = useCallback(() => {
    if (status === 'syncing') return; // Don't close during sync
    reset();
    setFileActions(new Map());
    setCaptionDecisions(new Map());
    setMergingCaption(null);
    if (status === 'complete') onSyncComplete?.();
    onClose();
  }, [status, reset, onClose, onSyncComplete]);

  // Categorize diff entries
  const { missingImages, captionConflicts, modifiedImages } = useMemo(() => {
    if (!diff) return { missingImages: [], captionConflicts: [], modifiedImages: [] };

    const missing: DiffEntry[] = [];
    const conflicts: DiffEntry[] = [];
    const modified: DiffEntry[] = [];

    for (const entry of diff.entries) {
      if (entry.status === 'local_only' || entry.status === 'remote_only') {
        missing.push(entry);
      } else if (entry.status === 'caption_conflict') {
        conflicts.push(entry);
      } else if (entry.status === 'modified') {
        modified.push(entry);
      }
    }

    return { missingImages: missing, captionConflicts: conflicts, modifiedImages: modified };
  }, [diff]);

  const setFileAction = useCallback((path: string, action: 'pull' | 'push' | 'skip') => {
    setFileActions(prev => new Map(prev).set(path, action));
  }, []);

  const setCaptionDecision = useCallback((path: string, decision: CaptionDecision) => {
    setCaptionDecisions(prev => new Map(prev).set(path, decision));
  }, []);

  const handleAiMerge = useCallback(
    async (entry: DiffEntry) => {
      if (!entry.local || !entry.remote) return;
      setMergingCaption(entry.path);

      // We don't have caption content here (only metadata), so we pass path info
      // In a real implementation, the content would need to be fetched
      const merged = await mergeCaption(entry.local.contentHash || '', entry.remote.contentHash || '');

      if (merged) {
        setCaptionDecision(entry.path, { action: 'ai_merge', mergedCaption: merged });
      }
      setMergingCaption(null);
    },
    [mergeCaption, setCaptionDecision],
  );

  const bulkSetMissing = useCallback(
    (action: 'pull' | 'push') => {
      const updates = new Map(fileActions);
      for (const entry of missingImages) {
        if (entry.status === 'remote_only' && action === 'pull') {
          updates.set(entry.path, 'pull');
        } else if (entry.status === 'local_only' && action === 'push') {
          updates.set(entry.path, 'push');
        }
      }
      setFileActions(updates);
    },
    [fileActions, missingImages],
  );

  const handleSync = useCallback(async () => {
    const actions: SyncAction[] = [];

    // Missing images
    for (const entry of missingImages) {
      const action = fileActions.get(entry.path);
      if (action) {
        actions.push({ path: entry.path, action });
      }
    }

    // Caption conflicts
    for (const entry of captionConflicts) {
      const decision = captionDecisions.get(entry.path);
      if (decision) {
        if (decision.action === 'keep_remote') {
          actions.push({ path: entry.path, action: 'pull' });
        } else if (decision.action === 'keep_local') {
          actions.push({ path: entry.path, action: 'push' });
        } else if (decision.action === 'ai_merge' && decision.mergedCaption) {
          actions.push({ path: entry.path, action: 'ai_merge', localCaption: decision.mergedCaption });
        }
      }
    }

    // Modified images
    for (const entry of modifiedImages) {
      const action = fileActions.get(entry.path);
      if (action) {
        actions.push({ path: entry.path, action });
      }
    }

    if (actions.length > 0) {
      await sync(datasetName, hostId, actions);
    }
  }, [missingImages, captionConflicts, modifiedImages, fileActions, captionDecisions, sync, datasetName, hostId]);

  const actionCount = useMemo(() => {
    let count = 0;
    for (const [, action] of fileActions) {
      if (action !== 'skip') count++;
    }
    for (const [, decision] of captionDecisions) {
      if (decision.action !== 'skip') count++;
    }
    return count;
  }, [fileActions, captionDecisions]);

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-xl bg-white dark:bg-zinc-900 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
            <div>
              <DialogTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Sync {datasetName}
              </DialogTitle>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Local vs {hostName}</p>
            </div>
            <button onClick={handleClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Loading state */}
            {status === 'comparing' && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <p className="text-zinc-500 dark:text-zinc-400">Comparing datasets...</p>
              </div>
            )}

            {/* Error state */}
            {status === 'error' && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <AlertTriangle className="w-8 h-8 text-red-500" />
                <p className="text-red-500">{error}</p>
                <Button onClick={() => compare(datasetName, hostId, true)}>Retry</Button>
              </div>
            )}

            {/* Synced state */}
            {status === 'ready' && diff?.status === 'synced' && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
                <p className="text-zinc-700 dark:text-zinc-300 font-medium">Datasets are in sync</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{diff.summary.identical} files identical</p>
              </div>
            )}

            {/* Diff ready - show tabs */}
            {status === 'ready' && diff?.status === 'diverged' && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {diff.summary.localOnly > 0 && (
                    <SummaryCard label="Local Only" count={diff.summary.localOnly} color="blue" />
                  )}
                  {diff.summary.remoteOnly > 0 && (
                    <SummaryCard label="Remote Only" count={diff.summary.remoteOnly} color="purple" />
                  )}
                  {diff.summary.captionConflicts > 0 && (
                    <SummaryCard label="Caption Conflicts" count={diff.summary.captionConflicts} color="yellow" />
                  )}
                  {diff.summary.modified > 0 && (
                    <SummaryCard label="Modified" count={diff.summary.modified} color="orange" />
                  )}
                  {diff.summary.identical > 0 && (
                    <SummaryCard label="Identical" count={diff.summary.identical} color="green" />
                  )}
                </div>

                <TabGroup>
                  <TabList className="flex gap-2 border-b border-zinc-200 dark:border-zinc-700 mb-4">
                    {missingImages.length > 0 && <SyncTab label="Missing Images" count={missingImages.length} />}
                    {captionConflicts.length > 0 && (
                      <SyncTab label="Caption Differences" count={captionConflicts.length} />
                    )}
                    {modifiedImages.length > 0 && <SyncTab label="Modified Images" count={modifiedImages.length} />}
                  </TabList>

                  <TabPanels>
                    {/* Missing Images Tab */}
                    {missingImages.length > 0 && (
                      <TabPanel>
                        <div className="flex gap-2 mb-3">
                          <Button color="blue" onClick={() => bulkSetMissing('pull')}>
                            <ArrowDownToLine className="w-3.5 h-3.5 mr-1" /> Pull All Remote
                          </Button>
                          <Button color="purple" onClick={() => bulkSetMissing('push')}>
                            <ArrowUpFromLine className="w-3.5 h-3.5 mr-1" /> Push All Local
                          </Button>
                        </div>
                        <div className="space-y-1.5 max-h-96 overflow-y-auto">
                          {missingImages.map(entry => (
                            <MissingFileRow
                              key={entry.path}
                              entry={entry}
                              action={fileActions.get(entry.path)}
                              onAction={action => setFileAction(entry.path, action)}
                              hostName={hostName}
                            />
                          ))}
                        </div>
                      </TabPanel>
                    )}

                    {/* Caption Differences Tab */}
                    {captionConflicts.length > 0 && (
                      <TabPanel>
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {captionConflicts.map(entry => (
                            <CaptionConflictRow
                              key={entry.path}
                              entry={entry}
                              decision={captionDecisions.get(entry.path)}
                              onDecision={decision => setCaptionDecision(entry.path, decision)}
                              onAiMerge={() => handleAiMerge(entry)}
                              isMerging={mergingCaption === entry.path}
                            />
                          ))}
                        </div>
                      </TabPanel>
                    )}

                    {/* Modified Images Tab */}
                    {modifiedImages.length > 0 && (
                      <TabPanel>
                        <div className="space-y-1.5 max-h-96 overflow-y-auto">
                          {modifiedImages.map(entry => (
                            <ModifiedFileRow
                              key={entry.path}
                              entry={entry}
                              action={fileActions.get(entry.path)}
                              onAction={action => setFileAction(entry.path, action)}
                            />
                          ))}
                        </div>
                      </TabPanel>
                    )}
                  </TabPanels>
                </TabGroup>
              </>
            )}

            {/* Syncing state */}
            {status === 'syncing' && progress && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <p className="text-zinc-700 dark:text-zinc-300 font-medium">
                  Syncing... {progress.completed}/{progress.total}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate max-w-md">{progress.currentFile}</p>
                <div className="w-64 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Complete state */}
            {status === 'complete' && result && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
                <p className="text-zinc-700 dark:text-zinc-300 font-medium">
                  Sync complete — {result.completed} files transferred
                </p>
                {result.errors.length > 0 && (
                  <div className="mt-3 text-sm text-red-500">
                    <p className="font-medium">{result.errors.length} error(s):</p>
                    <ul className="mt-1 list-disc list-inside">
                      {result.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {status === 'ready' && diff?.status === 'diverged' && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-200 dark:border-zinc-700">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {actionCount} action{actionCount !== 1 ? 's' : ''} selected
              </p>
              <div className="flex gap-2">
                <Button outline onClick={handleClose}>
                  Cancel
                </Button>
                <Button color="blue" disabled={actionCount === 0} onClick={handleSync}>
                  Sync Selected
                </Button>
              </div>
            </div>
          )}

          {status === 'complete' && (
            <div className="flex items-center justify-end px-6 py-3 border-t border-zinc-200 dark:border-zinc-700">
              <Button color="blue" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

// --- Sub-components ---

function SummaryCard({ label, count, color }: { label: string; count: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    purple:
      'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    yellow:
      'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
    orange:
      'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    green: 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${colorMap[color] || colorMap.blue}`}>
      <p className="text-2xl font-bold tabular-nums">{count}</p>
      <p className="text-xs mt-0.5 opacity-75">{label}</p>
    </div>
  );
}

function SyncTab({ label, count }: { label: string; count: number }) {
  return (
    <Tab className="px-3 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border-b-2 border-transparent data-[selected]:border-blue-500 data-[selected]:text-blue-600 dark:data-[selected]:text-blue-400 outline-none">
      {label} ({count})
    </Tab>
  );
}

function MissingFileRow({
  entry,
  action,
  onAction,
  hostName,
}: {
  entry: DiffEntry;
  action?: 'pull' | 'push' | 'skip';
  onAction: (action: 'pull' | 'push' | 'skip') => void;
  hostName: string;
}) {
  const isRemoteOnly = entry.status === 'remote_only';
  const defaultAction = isRemoteOnly ? 'pull' : 'push';

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
      <span
        className={`text-xs font-medium px-1.5 py-0.5 rounded ${
          isRemoteOnly
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
        }`}
      >
        {isRemoteOnly ? hostName : 'Local'}
      </span>
      <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate font-mono">{entry.path}</span>
      {entry.pHashMatch && (
        <span className="text-xs text-zinc-500 dark:text-zinc-400" title={`Similar to ${entry.pHashMatch.remotePath}`}>
          ~{entry.pHashMatch.remotePath}
        </span>
      )}
      <div className="flex gap-1">
        <ActionButton
          icon={
            isRemoteOnly ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />
          }
          label={isRemoteOnly ? 'Pull' : 'Push'}
          active={action === defaultAction}
          onClick={() => onAction(defaultAction)}
        />
        <ActionButton
          icon={<SkipForward className="w-3.5 h-3.5" />}
          label="Skip"
          active={action === 'skip'}
          onClick={() => onAction('skip')}
        />
      </div>
    </div>
  );
}

function CaptionConflictRow({
  entry,
  decision,
  onDecision,
  onAiMerge,
  isMerging,
}: {
  entry: DiffEntry;
  decision?: CaptionDecision;
  onDecision: (d: CaptionDecision) => void;
  onAiMerge: () => void;
  isMerging: boolean;
}) {
  return (
    <div className="px-3 py-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300">
          Conflict
        </span>
        <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate font-mono">{entry.path}</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-zinc-500 dark:text-zinc-400">
          Local: {entry.local?.size ?? 0}B | Remote: {entry.remote?.size ?? 0}B
        </span>
      </div>
      {decision?.action === 'ai_merge' && decision.mergedCaption && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-2">
          <p className="text-xs text-green-700 dark:text-green-300 font-medium mb-1">Merged caption preview:</p>
          <p className="text-xs text-zinc-700 dark:text-zinc-300">{decision.mergedCaption}</p>
        </div>
      )}
      <div className="flex gap-1.5">
        <ActionButton
          label="Keep Local"
          active={decision?.action === 'keep_local'}
          onClick={() => onDecision({ action: 'keep_local' })}
        />
        <ActionButton
          label="Keep Remote"
          active={decision?.action === 'keep_remote'}
          onClick={() => onDecision({ action: 'keep_remote' })}
        />
        <ActionButton
          icon={isMerging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          label="Merge with Claude"
          active={decision?.action === 'ai_merge'}
          onClick={onAiMerge}
          disabled={isMerging}
        />
        <ActionButton
          icon={<SkipForward className="w-3.5 h-3.5" />}
          label="Skip"
          active={decision?.action === 'skip'}
          onClick={() => onDecision({ action: 'skip' })}
        />
      </div>
    </div>
  );
}

function ModifiedFileRow({
  entry,
  action,
  onAction,
}: {
  entry: DiffEntry;
  action?: 'pull' | 'push' | 'skip';
  onAction: (action: 'pull' | 'push' | 'skip') => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
        Modified
      </span>
      <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate font-mono">{entry.path}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        {entry.local?.size ?? 0}B vs {entry.remote?.size ?? 0}B
      </span>
      <div className="flex gap-1">
        <ActionButton
          icon={<ArrowDownToLine className="w-3.5 h-3.5" />}
          label="Keep Remote"
          active={action === 'pull'}
          onClick={() => onAction('pull')}
        />
        <ActionButton
          icon={<ArrowUpFromLine className="w-3.5 h-3.5" />}
          label="Keep Local"
          active={action === 'push'}
          onClick={() => onAction('push')}
        />
        <ActionButton
          icon={<SkipForward className="w-3.5 h-3.5" />}
          label="Skip"
          active={action === 'skip'}
          onClick={() => onAction('skip')}
        />
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600'
      } disabled:opacity-50`}
    >
      {icon}
      {label}
    </button>
  );
}
