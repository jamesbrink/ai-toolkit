'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { Cloud, ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';
import { GpuTypeInfo, GpuTypeDatacenterInfo } from '@/hooks/useRunPodGpuTypes';
import { apiClient } from '@/utils/api';

interface DeployPodModalProps {
  isOpen: boolean;
  onClose: () => void;
  gpuTypes: GpuTypeInfo[];
  onDeployed: () => void;
  defaultSshKey?: string;
}

type InstanceType = 'ON_DEMAND' | 'SPOT';

const stockBadge: Record<string, { color: string; label: string }> = {
  High: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', label: 'High' },
  Medium: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300', label: 'Medium' },
  Low: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', label: 'Low' },
};

function getStockBadge(status: string | null | undefined) {
  if (!status) return null;
  return stockBadge[status] || null;
}

function sortGpus(gpus: GpuTypeInfo[], cloudType: 'COMMUNITY' | 'SECURE'): GpuTypeInfo[] {
  const stockOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  return [...gpus].sort((a, b) => {
    const aStock = a.lowestPrice?.stockStatus;
    const bStock = b.lowestPrice?.stockStatus;
    const aOrder = aStock ? (stockOrder[aStock] ?? 3) : 4;
    const bOrder = bStock ? (stockOrder[bStock] ?? 3) : 4;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aPrice = (cloudType === 'SECURE' ? a.securePrice : a.communityPrice) ?? Infinity;
    const bPrice = (cloudType === 'SECURE' ? b.securePrice : b.communityPrice) ?? Infinity;
    return aPrice - bPrice;
  });
}

export default function DeployPodModal({
  isOpen,
  onClose,
  gpuTypes,
  onDeployed,
  defaultSshKey = '',
}: DeployPodModalProps) {
  const [name, setName] = useState('ai-toolkit');
  const [gpuTypeId, setGpuTypeId] = useState('');
  const [cloudType, setCloudType] = useState<'COMMUNITY' | 'SECURE'>('COMMUNITY');
  const [gpuCount, setGpuCount] = useState(1);
  const [volumeInGb, setVolumeInGb] = useState(50);
  const [containerDiskInGb, setContainerDiskInGb] = useState(20);
  const [dataCenterId, setDataCenterId] = useState('');
  const [instanceType, setInstanceType] = useState<InstanceType>('ON_DEMAND');
  const [bidPerGpu, setBidPerGpu] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sshPublicKey, setSshPublicKey] = useState(defaultSshKey);
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');

  const selectedGpu = gpuTypes.find(g => g.id === gpuTypeId);
  const filteredGpus = useMemo(
    () =>
      sortGpus(
        gpuTypes.filter(g => (cloudType === 'SECURE' ? g.secureCloud : g.communityCloud)),
        cloudType,
      ),
    [gpuTypes, cloudType],
  );

  const maxGpuCount = selectedGpu
    ? cloudType === 'SECURE'
      ? selectedGpu.maxGpuCountSecureCloud
      : selectedGpu.maxGpuCountCommunityCloud
    : 1;

  const pricePerGpu =
    instanceType === 'SPOT'
      ? (cloudType === 'SECURE' ? selectedGpu?.secureSpotPrice : selectedGpu?.communitySpotPrice) || 0
      : (cloudType === 'SECURE' ? selectedGpu?.securePrice : selectedGpu?.communityPrice) || 0;

  const estimatedCost = pricePerGpu * gpuCount;

  const handleGpuChange = (id: string) => {
    setGpuTypeId(id);
    setDataCenterId('');
    const newGpu = gpuTypes.find(g => g.id === id);
    if (newGpu) {
      const newMax = cloudType === 'SECURE' ? newGpu.maxGpuCountSecureCloud : newGpu.maxGpuCountCommunityCloud;
      if (gpuCount > newMax) setGpuCount(Math.max(1, newMax));
      const spotPrice = cloudType === 'SECURE' ? newGpu.secureSpotPrice : newGpu.communitySpotPrice;
      setBidPerGpu(spotPrice || 0);
    }
  };

  const handleCloudTypeChange = (type: 'COMMUNITY' | 'SECURE') => {
    setCloudType(type);
    setGpuTypeId('');
    setGpuCount(1);
    setDataCenterId('');
  };

  const handleInstanceTypeChange = (type: InstanceType) => {
    setInstanceType(type);
    if (type === 'SPOT' && selectedGpu) {
      const spotPrice = cloudType === 'SECURE' ? selectedGpu.secureSpotPrice : selectedGpu.communitySpotPrice;
      setBidPerGpu(spotPrice || 0);
    }
  };

  const handleAddEnvVar = () => setEnvVars(prev => [...prev, { key: '', value: '' }]);
  const handleRemoveEnvVar = (index: number) => setEnvVars(prev => prev.filter((_, i) => i !== index));
  const handleEnvVarChange = (index: number, field: 'key' | 'value', val: string) => {
    setEnvVars(prev => prev.map((ev, i) => (i === index ? { ...ev, [field]: val } : ev)));
  };

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

    const env: Record<string, string> = {};
    for (const ev of envVars) {
      if (ev.key.trim()) env[ev.key.trim()] = ev.value;
    }

    try {
      await apiClient.post('/api/runpod/pods', {
        name: name.trim(),
        gpuTypeId,
        gpuTypeDisplay: selectedGpu?.displayName || gpuTypeId,
        gpuCount,
        cloudType,
        volumeInGb,
        containerDiskInGb,
        dataCenterId: dataCenterId || undefined,
        dataCenterName: selectedGpu?.nodeGroupDatacenters.find(dc => dc.id === dataCenterId)?.name || '',
        dataCenterRegion: selectedGpu?.nodeGroupDatacenters.find(dc => dc.id === dataCenterId)?.location || '',
        instanceType,
        bidPerGpu: instanceType === 'SPOT' ? bidPerGpu : undefined,
        publicKey: sshPublicKey || undefined,
        env: Object.keys(env).length > 0 ? env : undefined,
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
        className="fixed inset-0 bg-zinc-900/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-lg bg-white dark:bg-zinc-800 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-lg data-closed:sm:translate-y-0 data-closed:sm:scale-95"
          >
            <div className="bg-white dark:bg-zinc-800 px-4 pt-5 pb-4 sm:p-6">
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
                  <label htmlFor="pod-name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Pod Name
                  </label>
                  <input
                    id="pod-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="my-training-pod"
                  />
                </div>

                {/* Cloud Type */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Cloud Type</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="cloudType"
                        value="COMMUNITY"
                        checked={cloudType === 'COMMUNITY'}
                        onChange={() => handleCloudTypeChange('COMMUNITY')}
                        className="text-blue-500"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Community</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="cloudType"
                        value="SECURE"
                        checked={cloudType === 'SECURE'}
                        onChange={() => handleCloudTypeChange('SECURE')}
                        className="text-blue-500"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Secure</span>
                    </label>
                  </div>
                </div>

                {/* Instance Type */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Instance Type</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="instanceType"
                        value="ON_DEMAND"
                        checked={instanceType === 'ON_DEMAND'}
                        onChange={() => handleInstanceTypeChange('ON_DEMAND')}
                        className="text-blue-500"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">On-Demand</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="instanceType"
                        value="SPOT"
                        checked={instanceType === 'SPOT'}
                        onChange={() => handleInstanceTypeChange('SPOT')}
                        className="text-blue-500"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">Spot</span>
                      <span className="text-xs text-green-400">(cheaper, interruptible)</span>
                    </label>
                  </div>
                </div>

                {/* GPU Type (Listbox) */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">GPU Type</label>
                  <Listbox value={gpuTypeId} onChange={handleGpuChange}>
                    <ListboxButton className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between">
                      {selectedGpu ? (
                        <GpuOptionLabel gpu={selectedGpu} cloudType={cloudType} />
                      ) : (
                        <span className="text-zinc-500 dark:text-zinc-400">Select GPU...</span>
                      )}
                      <ChevronDown className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0 ml-2" />
                    </ListboxButton>
                    <ListboxOptions
                      anchor="bottom start"
                      className="z-50 w-[var(--button-width)] max-h-60 overflow-auto rounded-lg bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 py-1 shadow-lg focus:outline-none text-zinc-900 dark:text-zinc-100 [--anchor-gap:4px]"
                    >
                      {filteredGpus.map(gpu => {
                        const badge = getStockBadge(gpu.lowestPrice?.stockStatus);
                        const price = cloudType === 'SECURE' ? gpu.securePrice : gpu.communityPrice;
                        const unavailable = price == null;
                        return (
                          <ListboxOption
                            key={gpu.id}
                            value={gpu.id}
                            disabled={unavailable}
                            className={clsx(
                              'relative cursor-pointer select-none px-3 py-2 data-focus:bg-zinc-100 dark:data-focus:bg-zinc-600',
                              unavailable && 'opacity-50 cursor-not-allowed',
                            )}
                          >
                            {({ selected }) => (
                              <div className="flex items-center justify-between">
                                <GpuOptionLabel gpu={gpu} cloudType={cloudType} />
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  {badge && (
                                    <span className={clsx('px-1.5 py-0.5 rounded text-xs', badge.color)}>
                                      {badge.label}
                                    </span>
                                  )}
                                  {unavailable && (
                                    <span className="px-1.5 py-0.5 rounded text-xs bg-zinc-200 text-zinc-600 dark:bg-zinc-600 dark:text-zinc-300">
                                      No Price
                                    </span>
                                  )}
                                  {selected && <Check className="w-4 h-4 text-blue-400" />}
                                </div>
                              </div>
                            )}
                          </ListboxOption>
                        );
                      })}
                    </ListboxOptions>
                  </Listbox>
                </div>

                {/* GPU Count */}
                {selectedGpu && maxGpuCount > 1 && (
                  <div>
                    <label htmlFor="gpu-count" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      GPU Count
                    </label>
                    <select
                      id="gpu-count"
                      value={gpuCount}
                      onChange={e => setGpuCount(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {Array.from({ length: maxGpuCount }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>
                          {n} GPU{n > 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Datacenter */}
                {selectedGpu && selectedGpu.nodeGroupDatacenters.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Datacenter</label>
                    <Listbox value={dataCenterId} onChange={setDataCenterId}>
                      <ListboxButton className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between">
                        <span>
                          {dataCenterId
                            ? selectedGpu.nodeGroupDatacenters.find(dc => dc.id === dataCenterId)?.name || dataCenterId
                            : 'Any (Fastest Available)'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0 ml-2" />
                      </ListboxButton>
                      <ListboxOptions
                        anchor="bottom start"
                        className="z-50 w-[var(--button-width)] max-h-60 overflow-auto rounded-lg bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 py-1 shadow-lg focus:outline-none text-zinc-900 dark:text-zinc-100 [--anchor-gap:4px]"
                      >
                        <ListboxOption
                          value=""
                          className="relative cursor-pointer select-none px-3 py-2 data-focus:bg-zinc-100 dark:data-focus:bg-zinc-600"
                        >
                          {({ selected }) => (
                            <div className="flex items-center justify-between">
                              <span>Any (Fastest Available)</span>
                              {selected && <Check className="w-4 h-4 text-blue-400" />}
                            </div>
                          )}
                        </ListboxOption>
                        {selectedGpu.nodeGroupDatacenters.map((dc: GpuTypeDatacenterInfo) => (
                          <ListboxOption
                            key={dc.id}
                            value={dc.id}
                            className="relative cursor-pointer select-none px-3 py-2 data-focus:bg-zinc-100 dark:data-focus:bg-zinc-600"
                          >
                            {({ selected }) => (
                              <div className="flex items-center justify-between">
                                <div>
                                  <span>{dc.name}</span>
                                  {dc.location && (
                                    <span className="text-zinc-500 dark:text-zinc-400 text-xs ml-2">{dc.location}</span>
                                  )}
                                </div>
                                {selected && <Check className="w-4 h-4 text-blue-400" />}
                              </div>
                            )}
                          </ListboxOption>
                        ))}
                      </ListboxOptions>
                    </Listbox>
                  </div>
                )}

                {/* Spot Bid Price */}
                {instanceType === 'SPOT' && selectedGpu && (
                  <div>
                    <label htmlFor="bid-price" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Max Bid Price ($/hr per GPU)
                    </label>
                    <input
                      id="bid-price"
                      type="number"
                      min={0}
                      step={0.01}
                      value={bidPerGpu}
                      onChange={e => setBidPerGpu(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      Current spot price: $
                      {(
                        (cloudType === 'SECURE' ? selectedGpu.secureSpotPrice : selectedGpu.communitySpotPrice) || 0
                      ).toFixed(2)}
                      /hr
                    </p>
                  </div>
                )}

                {/* Volume / Disk */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="volume-size" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Volume (GB)
                    </label>
                    <input
                      id="volume-size"
                      type="number"
                      min={0}
                      value={volumeInGb}
                      onChange={e => setVolumeInGb(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="disk-size" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Container Disk (GB)
                    </label>
                    <input
                      id="disk-size"
                      type="number"
                      min={1}
                      value={containerDiskInGb}
                      onChange={e => setContainerDiskInGb(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Advanced Section */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                  >
                    {showAdvanced ? 'Hide' : 'Show'} Advanced Options
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 space-y-4 border-t border-zinc-200 dark:border-zinc-700 pt-3">
                      {/* SSH Public Key */}
                      <div>
                        <label htmlFor="ssh-key" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                          SSH Public Key
                        </label>
                        <textarea
                          id="ssh-key"
                          value={sshPublicKey}
                          onChange={e => setSshPublicKey(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs font-mono"
                          placeholder="ssh-ed25519 AAAA..."
                        />
                      </div>

                      {/* Environment Variables */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Environment Variables</label>
                          <button
                            type="button"
                            onClick={handleAddEnvVar}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            + Add Variable
                          </button>
                        </div>
                        {envVars.map((ev, i) => (
                          <div key={i} className="flex items-center space-x-2 mb-2">
                            <input
                              type="text"
                              value={ev.key}
                              onChange={e => handleEnvVarChange(i, 'key', e.target.value)}
                              placeholder="KEY"
                              className="flex-1 px-2 py-1.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded text-zinc-900 dark:text-zinc-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <input
                              type="text"
                              value={ev.value}
                              onChange={e => handleEnvVarChange(i, 'value', e.target.value)}
                              placeholder="value"
                              className="flex-1 px-2 py-1.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded text-zinc-900 dark:text-zinc-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveEnvVar(i)}
                              className="text-zinc-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 text-sm"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Cost Estimate */}
                {selectedGpu && (
                  <div className="bg-zinc-100 dark:bg-zinc-700 rounded-lg p-3">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      Estimated cost:{' '}
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        ${estimatedCost.toFixed(2)}/hr
                        {gpuCount > 1 && (
                          <span className="text-zinc-600 dark:text-zinc-300 font-normal">
                            {' '}
                            (${pricePerGpu.toFixed(2)} x {gpuCount})
                          </span>
                        )}
                      </span>
                      {instanceType === 'SPOT' && (
                        <span className="ml-2 text-xs text-green-600 dark:text-green-400">Spot pricing</span>
                      )}
                    </p>
                  </div>
                )}

                {error && <p className="text-sm text-red-400">{error}</p>}
              </div>
            </div>

            <div className="bg-zinc-100 dark:bg-zinc-700 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
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
                className="mt-3 inline-flex w-full justify-center rounded-md bg-zinc-200 dark:bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-600 sm:mt-0 sm:w-auto"
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

function GpuOptionLabel({ gpu, cloudType }: { gpu: GpuTypeInfo; cloudType: 'COMMUNITY' | 'SECURE' }) {
  const price = cloudType === 'SECURE' ? gpu.securePrice : gpu.communityPrice;
  return (
    <span className="truncate text-zinc-900 dark:text-zinc-100">
      {gpu.displayName}{' '}
      <span className="text-zinc-500 dark:text-zinc-300">
        ({gpu.memoryInGb}GB) — ${price?.toFixed(2) ?? '?'}/hr
      </span>
    </span>
  );
}
