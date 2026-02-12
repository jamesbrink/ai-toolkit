'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar, MainContent } from '@/components/layout';
import { ArrowLeft, Square, Play, Trash2, Download } from 'lucide-react';
import { Button } from '@headlessui/react';
import classNames from 'classnames';
import { RunPodPodInfo } from '@/hooks/useRunPodPods';
import useRemoteJobs from '@/hooks/useRemoteJobs';
import { openConfirm } from '@/components/ConfirmModal';
import { apiClient } from '@/utils/api';
import PodOverviewTab from '@/components/runpod/PodOverviewTab';
import PodLogsTab from '@/components/runpod/PodLogsTab';
import PodTrainingTab from '@/components/runpod/PodTrainingTab';

const statusConfig: Record<string, { color: string; label: string }> = {
  deploying: { color: 'bg-yellow-900 text-yellow-300', label: 'Deploying' },
  running: { color: 'bg-green-900 text-green-300', label: 'Running' },
  stopped: { color: 'bg-gray-700 text-gray-300', label: 'Stopped' },
  error: { color: 'bg-red-900 text-red-300', label: 'Error' },
  terminated: { color: 'bg-gray-700 text-gray-400', label: 'Terminated' },
};

export interface LivePodData {
  runtime: {
    uptimeInSeconds: number;
    gpus: Array<{
      id: string;
      gpuUtilPerc: number;
      memoryUtilPerc: number;
    }> | null;
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

type TabKey = 'overview' | 'logs' | 'training';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'logs', label: 'Logs' },
  { key: 'training', label: 'Training' },
];

export default function RunPodPodDetailPage() {
  const params = useParams<{ podId: string }>();
  const router = useRouter();
  const [pod, setPod] = useState<RunPodPodInfo | null>(null);
  const [liveData, setLiveData] = useState<LivePodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const currentStatus = pod?.currentStatus;

  // Remote jobs hook — only active when pod has a linked host
  const hostId = pod?.hostId ?? null;
  const { activeJob, status: remoteJobsStatus, refreshJobs } = useRemoteJobs(hostId);

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

      <MainContent className="pt-24">
        {activeTab === 'overview' && <PodOverviewTab pod={pod} liveData={liveData} />}
        {activeTab === 'logs' && (
          <PodLogsTab
            hostId={hostId}
            activeJob={activeJob}
            remoteJobsStatus={remoteJobsStatus}
            onRetryRemoteJobs={refreshJobs}
          />
        )}
        {activeTab === 'training' && (
          <PodTrainingTab
            hostId={hostId}
            activeJob={activeJob}
            remoteJobsStatus={remoteJobsStatus}
            onRetryRemoteJobs={refreshJobs}
          />
        )}
      </MainContent>

      {/* Tab bar — must be after MainContent in DOM so it stacks on top */}
      <div className="bg-gray-800 absolute top-12 left-0 w-full h-10 flex items-center px-2 text-sm overflow-x-auto">
        {tabs.map(tab => (
          <Button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={classNames('px-4 py-2 h-10 whitespace-nowrap shrink-0', activeTab === tab.key && 'bg-gray-700')}
          >
            {tab.label}
          </Button>
        ))}
      </div>
    </>
  );
}
