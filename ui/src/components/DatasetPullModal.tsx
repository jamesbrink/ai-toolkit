'use client';

import { useState } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { Button } from '@headlessui/react';
import { TextInput } from '@/components/formInputs';
import { useDatasetPull } from '@/hooks/useDatasetPull';
import { Download } from 'lucide-react';
import { LuLoader } from 'react-icons/lu';

interface DatasetPullModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetName: string;
  hostId: string;
  hostName: string;
}

export default function DatasetPullModal({ isOpen, onClose, datasetName, hostId, hostName }: DatasetPullModalProps) {
  const [localName, setLocalName] = useState('');
  const { status, progress, error, startPull, reset } = useDatasetPull();

  const isPulling = status === 'pulling';
  const isComplete = status === 'complete';

  const handlePull = () => {
    if (isPulling) return;
    startPull(datasetName, hostId, localName || undefined);
  };

  const handleClose = () => {
    if (isPulling) return;
    reset();
    setLocalName('');
    onClose();
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.transferred / progress.total) * 100) : 0;

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/50" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl bg-white dark:bg-zinc-800 p-6 shadow-xl border border-zinc-200 dark:border-zinc-700">
          <DialogTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Download className="w-5 h-5" />
            Clone Dataset Locally
          </DialogTitle>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm text-zinc-500 dark:text-zinc-400 mb-1">Remote Dataset</label>
              <div className="text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-700 rounded px-3 py-2 text-sm">
                {datasetName}
                <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">from {hostName}</span>
              </div>
            </div>

            <TextInput
              label="Local Name (optional)"
              value={localName}
              onChange={value => setLocalName(value)}
              placeholder={datasetName}
              disabled={isPulling || isComplete}
            />

            {isPulling && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-zinc-500 dark:text-zinc-400">
                  <span>Downloading files...</span>
                  <span>
                    {progress.transferred}/{progress.total} ({progressPercent}%)
                  </span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {progress.currentFile && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{progress.currentFile}</p>
                )}
              </div>
            )}

            {isComplete && (
              <div className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded px-3 py-2">
                Successfully cloned {progress.transferred} files locally.
              </div>
            )}

            {error && (
              <div className="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              className="px-4 py-2 rounded-md bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50"
              onClick={handleClose}
              disabled={isPulling}
            >
              {isComplete ? 'Done' : 'Cancel'}
            </Button>
            {!isComplete && (
              <Button
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2"
                onClick={handlePull}
                disabled={isPulling}
              >
                {isPulling ? (
                  <>
                    <LuLoader className="animate-spin w-4 h-4" />
                    Cloning...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Clone
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
