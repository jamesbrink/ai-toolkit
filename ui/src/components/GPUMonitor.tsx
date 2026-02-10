import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GPUApiResponse } from '@/types';
import GPUWidget from '@/components/GPUWidget';
import { GPUWidgetSkeleton } from '@/components/Skeleton';
import { apiClient } from '@/utils/api';

const GpuMonitor: React.FC = () => {
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

    // Fetch immediately on component mount
    fetchGpuInfo();

    // Set up interval to fetch every 1 seconds
    const intervalId = setInterval(fetchGpuInfo, 1000);

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  console.log('state', {
    loading,
    gpuData,
    error,
    lastUpdated,
  });

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
        <div className="bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      );
    }

    if (!gpuData) {
      return (
        <div className="bg-yellow-900 border border-yellow-700 text-yellow-300 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">No GPU data available.</span>
        </div>
      );
    }

    if (!gpuData.hasNvidiaSmi && gpuData.deviceType !== 'mps') {
      return (
        <div className="bg-yellow-900 border border-yellow-700 text-yellow-300 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">No GPUs detected!</strong>
          <span className="block sm:inline"> No NVIDIA or Apple Silicon GPU found on this system.</span>
          {gpuData.error && <p className="mt-2 text-sm">{gpuData.error}</p>}
        </div>
      );
    }

    if (gpuData.gpus.length === 0) {
      return (
        <div className="bg-yellow-900 border border-yellow-700 text-yellow-300 px-4 py-3 rounded relative" role="alert">
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
        <div className="text-xs text-gray-400">Last updated: {lastUpdated?.toLocaleTimeString()}</div>
      </div>
      {content}
    </div>
  );
};

export default GpuMonitor;
