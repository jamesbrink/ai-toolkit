'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar, MainContent } from '@/components/layout';
import { ArrowLeft, Square, Play, Trash2, Download, Cpu } from 'lucide-react';
import classNames from 'classnames';
import { RunPodPodInfo } from '@/hooks/useRunPodPods';
import { openConfirm } from '@/components/ConfirmModal';
import { apiClient } from '@/utils/api';

const statusConfig: Record<string, { color: string; label: string }> = {
  deploying: { color: 'bg-yellow-900 text-yellow-300', label: 'Deploying' },
  running: { color: 'bg-green-900 text-green-300', label: 'Running' },
  stopped: { color: 'bg-gray-700 text-gray-300', label: 'Stopped' },
  error: { color: 'bg-red-900 text-red-300', label: 'Error' },
  terminated: { color: 'bg-gray-700 text-gray-400', label: 'Terminated' },
};

interface LiveGpu {
  id: string;
  gpuUtilPerc: number;
  memoryUtilPerc: number;
}

interface LivePodData {
  runtime: {
    uptimeInSeconds: number;
    gpus: LiveGpu[] | null;
    ports: Array<{
      ip: string;
      isIpPublic: boolean;
      privatePort: number;
      publicPort: number;
    }> | null;
  } | null;
  machineId: string | null;
  machine: { dataCenterId: string } | null;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  if (hr < 24) return `${hr}h ${remainMin}m`;
  const days = Math.floor(hr / 24);
  return `${days}d ${hr % 24}h`;
}

export default function RunPodPodDetailPage() {
  const params = useParams<{ podId: string }>();
  const router = useRouter();
  const [pod, setPod] = useState<RunPodPodInfo | null>(null);
  const [liveData, setLiveData] = useState<LivePodData | null>(null);
  const [loading, setLoading] = useState(true);
  const currentStatus = pod?.currentStatus;

  const fetchPod = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/runpod/pods/${params.podId}`);
      setPod(res.data.pod);
    } catch (err) {
      console.error('Failed to fetch pod:', err);
    } finally {
      setLoading(false);
    }
  }, [params.podId]);

  const fetchLive = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/runpod/pods/${params.podId}/live`);
      setLiveData(res.data.live);
    } catch {
      // Live data is best-effort
    }
  }, [params.podId]);

  useEffect(() => {
    fetchPod();
    const interval = setInterval(fetchPod, 5000);
    return () => clearInterval(interval);
  }, [fetchPod]);

  useEffect(() => {
    if (!currentStatus || currentStatus === 'terminated' || currentStatus === 'stopped') return;
    fetchLive();
    const interval = setInterval(fetchLive, 5000);
    return () => clearInterval(interval);
  }, [fetchLive, currentStatus]);

  const handleStop = () => {
    openConfirm({
      title: 'Stop Pod',
      message: `Stop "${pod?.name}"? You will not be charged while stopped.`,
      type: 'warning',
      confirmText: 'Stop',
      onConfirm: async () => {
        await apiClient.post(`/api/runpod/pods/${params.podId}/stop`);
        fetchPod();
      },
    });
  };

  const handleResume = async () => {
    await apiClient.post(`/api/runpod/pods/${params.podId}/resume`);
    fetchPod();
  };

  const handleTerminate = () => {
    openConfirm({
      title: 'Terminate Pod',
      message: `Permanently terminate "${pod?.name}"? All data on the pod will be lost. Total spend: $${pod?.estimatedSpend?.toFixed(2)}.`,
      type: 'danger',
      confirmText: 'Terminate',
      onConfirm: async () => {
        await apiClient.post(`/api/runpod/pods/${params.podId}/terminate`);
        fetchPod();
      },
    });
  };

  const handleDownload = () => {
    openConfirm({
      title: 'Download Training Results',
      message: 'Enter the dataset or output name to download from the remote pod.',
      type: 'info',
      inputTitle: 'Dataset name',
      confirmText: 'Download',
      onConfirm: async value => {
        if (!value) return;
        const res = await apiClient.post(
          `/api/runpod/pods/${params.podId}/download`,
          { remotePath: value },
          { responseType: 'blob' },
        );
        const url = window.URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${value}.zip`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
    });
  };

  if (loading) {
    return (
      <>
        <TopBar>
          <h1 className="text-lg">Loading...</h1>
        </TopBar>
        <MainContent>
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-800 rounded w-1/3"></div>
            <div className="h-4 bg-gray-800 rounded w-1/2"></div>
            <div className="h-4 bg-gray-800 rounded w-2/3"></div>
          </div>
        </MainContent>
      </>
    );
  }

  if (!pod) {
    return (
      <>
        <TopBar>
          <h1 className="text-lg">Pod Not Found</h1>
        </TopBar>
        <MainContent>
          <p className="text-gray-400">The requested pod was not found.</p>
        </MainContent>
      </>
    );
  }

  const status = statusConfig[pod.currentStatus] || statusConfig.error;
  const isActive = pod.currentStatus === 'running' || pod.currentStatus === 'deploying';
  const isStopped = pod.currentStatus === 'stopped';
  const isTerminated = pod.currentStatus === 'terminated';
  const gpus = liveData?.runtime?.gpus;

  return (
    <>
      <TopBar>
        <button
          onClick={() => router.push('/hosts')}
          className="flex items-center space-x-1 text-gray-400 hover:text-white transition-colors mr-3"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>
        <div className="flex items-center space-x-3">
          <h1 className="text-lg">{pod.name}</h1>
          <span className={classNames('px-2 py-0.5 rounded-full text-xs', status.color)}>{status.label}</span>
          {pod.instanceType === 'SPOT' && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-green-900 text-green-300">Spot</span>
          )}
        </div>
        <div className="flex-1"></div>
        <div className="flex items-center space-x-2">
          {isActive && (
            <button
              onClick={handleStop}
              className="flex items-center space-x-1 px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 rounded-lg transition-colors text-sm"
            >
              <Square className="w-4 h-4" />
              <span>Stop</span>
            </button>
          )}
          {isStopped && (
            <button
              onClick={handleResume}
              className="flex items-center space-x-1 px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg transition-colors text-sm"
            >
              <Play className="w-4 h-4" />
              <span>Resume</span>
            </button>
          )}
          {pod.hostId && !isTerminated && (
            <button
              onClick={handleDownload}
              className="flex items-center space-x-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
          )}
          {!isTerminated && (
            <button
              onClick={handleTerminate}
              className="flex items-center space-x-1 px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded-lg transition-colors text-sm"
            >
              <Trash2 className="w-4 h-4" />
              <span>Terminate</span>
            </button>
          )}
        </div>
      </TopBar>
      <MainContent>
        <div className="max-w-2xl space-y-6">
          {/* GPU Utilization */}
          {gpus && gpus.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Cpu className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-medium text-gray-300">GPU Utilization</h3>
              </div>
              <div className="space-y-3">
                {gpus.map((gpu, i) => (
                  <div key={gpu.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>GPU {i}{gpus.length > 1 ? ` (${gpu.id})` : ''}</span>
                      <span>{gpu.gpuUtilPerc}% compute &middot; {gpu.memoryUtilPerc}% memory</span>
                    </div>
                    <div className="flex space-x-2">
                      <div className="flex-1">
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${gpu.gpuUtilPerc}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${gpu.memoryUtilPerc}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata Table */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full">
              <tbody className="divide-y divide-gray-800">
                <MetaRow label="RunPod ID" value={pod.runpodId} />
                <MetaRow label="GPU" value={`${pod.gpuTypeDisplay}${pod.gpuCount > 1 ? ` x${pod.gpuCount}` : ''}`} />
                <MetaRow label="Cloud Type" value={pod.cloudType === 'SECURE' ? 'Secure Cloud' : 'Community Cloud'} />
                <MetaRow
                  label="Instance Type"
                  value={
                    pod.instanceType === 'SPOT'
                      ? `Spot (bid: $${pod.bidPerGpu.toFixed(2)}/hr per GPU)`
                      : 'On-Demand'
                  }
                />
                <MetaRow label="Cost" value={`$${pod.costPerHr.toFixed(2)}/hr`} />
                <MetaRow label="Uptime" value={formatUptime(pod.totalUptimeSeconds)} />
                <MetaRow label="Total Spend" value={`$${pod.estimatedSpend.toFixed(2)}`} />
                <MetaRow label="Volume" value={`${pod.volumeInGb} GB`} />
                <MetaRow label="Container Disk" value={`${pod.containerDiskInGb} GB`} />
                {pod.dataCenterName && (
                  <MetaRow
                    label="Datacenter"
                    value={`${pod.dataCenterName}${pod.dataCenterRegion ? ` — ${pod.dataCenterRegion}` : ''}`}
                  />
                )}
                {liveData?.machine?.dataCenterId && !pod.dataCenterName && (
                  <MetaRow label="Datacenter ID" value={liveData.machine.dataCenterId} />
                )}
                {pod.publicIp && <MetaRow label="Endpoint" value={`${pod.publicIp}:${pod.publicPort}`} />}
                <MetaRow label="Created" value={new Date(pod.createdAt).toLocaleString()} />
                {pod.terminatedAt && <MetaRow label="Terminated" value={new Date(pod.terminatedAt).toLocaleString()} />}
              </tbody>
            </table>
          </div>

          {/* Host Link */}
          {pod.hostId && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Linked Host</h3>
              <button
                onClick={() => router.push(`/hosts/${pod.hostId}`)}
                className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
              >
                View host details
              </button>
            </div>
          )}

          {/* Error */}
          {pod.errorMessage && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-4">
              <h3 className="text-sm font-medium text-red-400 mb-1">Error</h3>
              <p className="text-sm text-red-300">{pod.errorMessage}</p>
            </div>
          )}
        </div>
      </MainContent>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{label}</td>
      <td className="px-4 py-3 text-sm text-gray-100">{value}</td>
    </tr>
  );
}
