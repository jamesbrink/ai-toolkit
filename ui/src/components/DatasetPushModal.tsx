'use client';

import { useState } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { Button } from '@headlessui/react';
import { SelectInput } from '@/components/formInputs';
import { HostInfo } from '@/hooks/useHostList';
import { useDatasetPush } from '@/hooks/useDatasetPush';
import { Upload } from 'lucide-react';
import { LuLoader } from 'react-icons/lu';

interface DatasetPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetName: string;
  hosts: HostInfo[];
}

export default function DatasetPushModal({ isOpen, onClose, datasetName, hosts }: DatasetPushModalProps) {
  const [selectedHostId, setSelectedHostId] = useState<string>('');
  const { status, progress, error, startPush, reset } = useDatasetPush();

  const isPushing = status === 'pushing';
  const isComplete = status === 'complete';
  const selectedHost = hosts.find(h => h.id === selectedHostId);

  const handlePush = () => {
    if (!selectedHostId || isPushing) return;
    startPush(datasetName, selectedHostId);
  };

  const handleClose = () => {
    if (isPushing) return;
    reset();
    setSelectedHostId('');
    onClose();
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.transferred / progress.total) * 100) : 0;

  const hostOptions = hosts.map(h => ({
    value: h.id,
    label: `${h.name} (${h.address}:${h.port})`,
  }));

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/50" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl bg-gray-800 p-6 shadow-xl">
          <DialogTitle className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Push Dataset to Host
          </DialogTitle>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Dataset</label>
              <div className="text-gray-200 bg-gray-700 rounded px-3 py-2 text-sm">{datasetName}</div>
            </div>

            <SelectInput
              label="Target Host"
              value={selectedHostId}
              onChange={value => setSelectedHostId(value)}
              options={[{ value: '', label: 'Select a host...' }, ...hostOptions]}
              disabled={isPushing}
            />

            {isPushing && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Transferring files...</span>
                  <span>
                    {progress.transferred}/{progress.total} ({progressPercent}%)
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {progress.currentFile && <p className="text-xs text-gray-500 truncate">{progress.currentFile}</p>}
              </div>
            )}

            {isComplete && (
              <div className="text-sm text-green-400 bg-green-900/20 border border-green-800 rounded px-3 py-2">
                Successfully pushed {progress.transferred} files to {selectedHost?.name || 'remote host'}.
              </div>
            )}

            {error && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              className="px-4 py-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50"
              onClick={handleClose}
              disabled={isPushing}
            >
              {isComplete ? 'Done' : 'Cancel'}
            </Button>
            {!isComplete && (
              <Button
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2"
                onClick={handlePush}
                disabled={!selectedHostId || isPushing}
              >
                {isPushing ? (
                  <>
                    <LuLoader className="animate-spin w-4 h-4" />
                    Pushing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Push
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
