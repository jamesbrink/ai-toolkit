'use client';

import { useState } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { Cloud } from 'lucide-react';
import { GpuTypeInfo } from '@/hooks/useRunPodGpuTypes';
import { apiClient } from '@/utils/api';

interface DeployPodModalProps {
  isOpen: boolean;
  onClose: () => void;
  gpuTypes: GpuTypeInfo[];
  onDeployed: () => void;
}

export default function DeployPodModal({ isOpen, onClose, gpuTypes, onDeployed }: DeployPodModalProps) {
  const [name, setName] = useState('ai-toolkit');
  const [gpuTypeId, setGpuTypeId] = useState('');
  const [cloudType, setCloudType] = useState<'COMMUNITY' | 'SECURE'>('COMMUNITY');
  const [volumeInGb, setVolumeInGb] = useState(50);
  const [containerDiskInGb, setContainerDiskInGb] = useState(20);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');

  const selectedGpu = gpuTypes.find(g => g.id === gpuTypeId);
  const filteredGpus = gpuTypes.filter(g => (cloudType === 'SECURE' ? g.secureCloud : g.communityCloud));

  const estimatedCost = selectedGpu?.lowestPrice?.uninterruptablePrice || 0;

  const handleDeploy = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!gpuTypeId) {
      setError('Select a GPU type');
      return;
    }

    setDeploying(true);
    setError('');

    try {
      await apiClient.post('/api/runpod/pods', {
        name: name.trim(),
        gpuTypeId,
        gpuTypeDisplay: selectedGpu?.displayName || gpuTypeId,
        gpuCount: 1,
        cloudType,
        volumeInGb,
        containerDiskInGb,
      });
      onDeployed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deploy pod');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-10">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-900/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-lg bg-gray-800 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-lg data-closed:sm:translate-y-0 data-closed:sm:scale-95"
          >
            <div className="bg-gray-800 px-4 pt-5 pb-4 sm:p-6">
              <div className="flex items-center space-x-3 mb-6">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-500">
                  <Cloud className="size-5 text-blue-950" />
                </div>
                <DialogTitle as="h3" className="text-base font-semibold text-blue-500">
                  Deploy RunPod
                </DialogTitle>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label htmlFor="pod-name" className="block text-sm font-medium text-gray-300 mb-1">
                    Pod Name
                  </label>
                  <input
                    id="pod-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="my-training-pod"
                  />
                </div>

                {/* Cloud Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Cloud Type</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="cloudType"
                        value="COMMUNITY"
                        checked={cloudType === 'COMMUNITY'}
                        onChange={() => {
                          setCloudType('COMMUNITY');
                          setGpuTypeId('');
                        }}
                        className="text-blue-500"
                      />
                      <span className="text-sm text-gray-300">Community</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="cloudType"
                        value="SECURE"
                        checked={cloudType === 'SECURE'}
                        onChange={() => {
                          setCloudType('SECURE');
                          setGpuTypeId('');
                        }}
                        className="text-blue-500"
                      />
                      <span className="text-sm text-gray-300">Secure</span>
                    </label>
                  </div>
                </div>

                {/* GPU Type */}
                <div>
                  <label htmlFor="gpu-type" className="block text-sm font-medium text-gray-300 mb-1">
                    GPU Type
                  </label>
                  <select
                    id="gpu-type"
                    value={gpuTypeId}
                    onChange={e => setGpuTypeId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select GPU...</option>
                    {filteredGpus.map(gpu => (
                      <option key={gpu.id} value={gpu.id}>
                        {gpu.displayName} ({gpu.memoryInGb}GB) - $
                        {gpu.lowestPrice?.uninterruptablePrice?.toFixed(2) || '?'}/hr
                      </option>
                    ))}
                  </select>
                </div>

                {/* Volume / Disk */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="volume-size" className="block text-sm font-medium text-gray-300 mb-1">
                      Volume (GB)
                    </label>
                    <input
                      id="volume-size"
                      type="number"
                      min={0}
                      value={volumeInGb}
                      onChange={e => setVolumeInGb(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="disk-size" className="block text-sm font-medium text-gray-300 mb-1">
                      Container Disk (GB)
                    </label>
                    <input
                      id="disk-size"
                      type="number"
                      min={1}
                      value={containerDiskInGb}
                      onChange={e => setContainerDiskInGb(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Cost Estimate */}
                {selectedGpu && (
                  <div className="bg-gray-700 rounded-lg p-3">
                    <p className="text-sm text-gray-300">
                      Estimated cost:{' '}
                      <span className="font-semibold text-gray-100">${estimatedCost.toFixed(2)}/hr</span>
                    </p>
                  </div>
                )}

                {error && <p className="text-sm text-red-400">{error}</p>}
              </div>
            </div>

            <div className="bg-gray-700 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
              <button
                type="button"
                onClick={handleDeploy}
                disabled={deploying || !gpuTypeId}
                className="inline-flex w-full justify-center rounded-md bg-blue-700 hover:bg-blue-500 px-3 py-2 text-sm font-semibold text-white shadow-xs sm:ml-3 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deploying ? 'Deploying...' : 'Deploy'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 inline-flex w-full justify-center rounded-md bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800 sm:mt-0 sm:w-auto"
              >
                Cancel
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
