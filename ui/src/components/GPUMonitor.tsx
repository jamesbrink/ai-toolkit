import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GPUApiResponse } from '@/types';
import { HostInfo } from '@/hooks/useHostList';
import GPUWidget from '@/components/GPUWidget';
import { GPUWidgetSkeleton } from '@/components/Skeleton';
import { apiClient } from '@/utils/api';
import useAllGPUInfo from '@/hooks/useAllGPUInfo';

interface GpuMonitorProps {
  hosts?: HostInfo[];
}

const GpuMonitor: React.FC<GpuMonitorProps> = ({ hosts }) => {
  // Multi-host mode
  if (hosts) {
    return <MultiHostGpuMonitor hosts={hosts} />;
  }
  // Local-only mode (backward compat)
  return <LocalGpuMonitor />;
};

function MultiHostGpuMonitor({ hosts }: { hosts: HostInfo[] }) {
  const { allGpus, isLoading, lastUpdated } = useAllGPUInfo(hosts);

  const content = useMemo(() => {
    if (isLoading && allGpus.length === 0) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <GPUWidgetSkeleton />
          <GPUWidgetSkeleton />
        </div>
      );
    }

    if (allGpus.length === 0) {
      return (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 dark:bg-yellow-900 dark:border-yellow-700 dark:text-yellow-300 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">No GPUs detected on any host.</span>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {allGpus.map((gpu, idx) => (
          <GPUWidget
            key={`${gpu.source.hostId || 'local'}-${gpu.index}-${idx}`}
            gpu={gpu}
            hostName={gpu.source.type === 'remote' ? gpu.source.hostName : undefined}
            isRemote={gpu.source.type === 'remote'}
          />
        ))}
      </div>
    );
  }, [isLoading, allGpus]);

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-md">GPU Monitor</h1>
        <div className="text-xs text-zinc-500 dark:text-gray-400">Last updated: {lastUpdated?.toLocaleTimeString()}</div>
      </div>
      {content}
    </div>
  );
}

function LocalGpuMonitor() {
  const [gpuData, setGpuData] = useState<GPUApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isFetchingGpuRef = useRef(false);

  useEffect(() => {
    const fetchGpuInfo = async () => {
      if (isFetchingGpuRef.current) {
        return;
      }
      setLoading(true);
      isFetchingGpuRef.current = true;
      apiClient
        .get('/api/gpu')
        .then(res => res.data)
        .then(data => {
          setGpuData(data);
          setLastUpdated(new Date());
          setError(null);
        })
        .catch(err => {
          setError(`Failed to fetch GPU data: ${err instanceof Error ? err.message : String(err)}`);
        })
        .finally(() => {
          isFetchingGpuRef.current = false;
          setLoading(false);
        });
    };

    fetchGpuInfo();
    const intervalId = setInterval(fetchGpuInfo, 1000);
    return () => clearInterval(intervalId);
  }, []);

  const content = useMemo(() => {
    if (loading && !gpuData) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <GPUWidgetSkeleton />
          <GPUWidgetSkeleton />
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-300 text-red-800 dark:bg-red-900 dark:border-red-600 dark:text-red-200 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      );
    }

    if (!gpuData) {
      return (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 dark:bg-yellow-900 dark:border-yellow-700 dark:text-yellow-300 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">No GPU data available.</span>
        </div>
      );
    }

    if (!gpuData.hasNvidiaSmi && gpuData.deviceType !== 'mps') {
      return (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 dark:bg-yellow-900 dark:border-yellow-700 dark:text-yellow-300 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">No GPUs detected!</strong>
          <span className="block sm:inline"> No NVIDIA or Apple Silicon GPU found on this system.</span>
          {gpuData.error && <p className="mt-2 text-sm">{gpuData.error}</p>}
        </div>
      );
    }

    if (gpuData.gpus.length === 0) {
      return (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 dark:bg-yellow-900 dark:border-yellow-700 dark:text-yellow-300 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">No GPUs found, but nvidia-smi is available.</span>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {gpuData.gpus.map((gpu, idx) => (
          <GPUWidget key={idx} gpu={gpu} />
        ))}
      </div>
    );
  }, [loading, gpuData, error]);

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-md">GPU Monitor</h1>
        <div className="text-xs text-zinc-500 dark:text-gray-400">Last updated: {lastUpdated?.toLocaleTimeString()}</div>
      </div>
      {content}
    </div>
  );
}

export default GpuMonitor;
