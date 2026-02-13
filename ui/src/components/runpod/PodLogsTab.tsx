'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useJobLog from '@/hooks/useJobLog';
import { RemoteJob } from '@/hooks/useRemoteJobs';
import { RunPodPodInfo } from '@/hooks/useRunPodPods';
import { LivePodData } from '@/app/runpod/[podId]/page';
import { Loader2, RefreshCw } from 'lucide-react';
import classNames from 'classnames';

interface PodLogsTabProps {
  pod: RunPodPodInfo;
  liveData: LivePodData | null;
  hostId: string | null;
  activeJob: RemoteJob | null;
  remoteJobsStatus: 'idle' | 'loading' | 'success' | 'error';
  onRetryRemoteJobs: () => void;
}

interface DeployEvent {
  time: string;
  message: string;
  type: 'info' | 'success' | 'waiting';
}

/** Build a synthetic deployment event log from observable state transitions */
function buildDeployEvents(pod: RunPodPodInfo, liveData: LivePodData | null, hostId: string | null): DeployEvent[] {
  const events: DeployEvent[] = [];
  const createdAt = new Date(pod.createdAt).toLocaleTimeString();

  events.push({
    time: createdAt,
    message: `Pod "${pod.name}" created — requesting ${pod.gpuTypeDisplay}`,
    type: 'info',
  });

  if (pod.dataCenterName) {
    events.push({
      time: createdAt,
      message: `Datacenter: ${pod.dataCenterName}${pod.dataCenterRegion ? ` (${pod.dataCenterRegion})` : ''}`,
      type: 'info',
    });
  }

  if (pod.instanceType === 'SPOT') {
    events.push({
      time: createdAt,
      message: `Spot instance — bid: $${pod.bidPerGpu.toFixed(2)}/hr per GPU`,
      type: 'info',
    });
  }

  if (liveData?.machineId) {
    events.push({ time: '', message: `Machine assigned (${liveData.machineId})`, type: 'success' });
  }

  if (liveData?.runtime) {
    events.push({ time: '', message: 'Container runtime started', type: 'success' });

    if (liveData.runtime.uptimeInSeconds > 0) {
      events.push({ time: '', message: `Uptime: ${liveData.runtime.uptimeInSeconds}s`, type: 'info' });
    }

    if (liveData.runtime.ports && liveData.runtime.ports.length > 0) {
      const portList = liveData.runtime.ports.map(p => `${p.privatePort}→${p.publicPort}`).join(', ');
      events.push({ time: '', message: `Ports exposed: ${portList}`, type: 'success' });
    } else {
      events.push({ time: '', message: 'Waiting for ports to be assigned...', type: 'waiting' });
    }
  } else if (pod.currentStatus === 'deploying') {
    events.push({ time: '', message: 'Pulling container image and allocating resources...', type: 'waiting' });
  }

  if (pod.publicIp) {
    events.push({ time: '', message: `Public endpoint: ${pod.publicIp}:${pod.publicPort}`, type: 'success' });
  }

  // Always show the RunPod proxy URL for running/deploying pods (useful when no public IP)
  if (pod.currentStatus === 'running' || pod.currentStatus === 'deploying') {
    events.push({
      time: '',
      message: `RunPod proxy: https://${pod.runpodId}-8675.proxy.runpod.net/`,
      type: pod.publicIp ? 'info' : 'success',
    });
  }

  if (hostId) {
    events.push({ time: '', message: 'AI Toolkit instance connected', type: 'success' });
  } else if (liveData?.runtime?.ports && liveData.runtime.ports.length > 0) {
    events.push({ time: '', message: 'Waiting for AI Toolkit to start inside container...', type: 'waiting' });
  }

  if (pod.errorMessage) {
    events.push({ time: '', message: `Error: ${pod.errorMessage}`, type: 'info' });
  }

  return events;
}

const eventTypeColors: Record<string, string> = {
  info: 'text-gray-400',
  success: 'text-green-400',
  waiting: 'text-yellow-400',
};

function DeploymentLog({
  pod,
  liveData,
  hostId,
}: {
  pod: RunPodPodInfo;
  liveData: LivePodData | null;
  hostId: string | null;
}) {
  const events = useMemo(() => buildDeployEvents(pod, liveData, hostId), [pod, liveData, hostId]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const lastEvent = events[events.length - 1];
  const isWaiting = lastEvent?.type === 'waiting';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">Deployment Log</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-900 text-yellow-300">Deploying</span>
        </div>
      </div>
      <div
        ref={logRef}
        className="bg-gray-950 rounded-lg font-mono text-xs overflow-y-auto max-h-[calc(100vh-14rem)] flex-1 p-4"
      >
        {events.map((event, i) => (
          <div key={i} className={classNames('py-0.5', eventTypeColors[event.type])}>
            {event.time && <span className="text-gray-600 mr-2">[{event.time}]</span>}
            {event.type === 'success' && <span className="mr-1">✓</span>}
            {event.type === 'waiting' && i === events.length - 1 && <span className="mr-1">⏳</span>}
            {event.message}
          </div>
        ))}
        {isWaiting && (
          <div className="flex items-center gap-2 text-gray-500 mt-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Polling for updates every 5s...</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PodLogsTab({
  pod,
  liveData,
  hostId,
  activeJob,
  remoteJobsStatus,
  onRetryRemoteJobs,
}: PodLogsTabProps) {
  const jobId = activeJob?.id ?? '';
  const { log, status: logStatus } = useJobLog(jobId, jobId ? 3000 : null, hostId);

  const logRef = useRef<HTMLDivElement>(null);
  const [isFollowing, setIsFollowing] = useState(true);

  const logLines = useMemo(() => {
    if (!log) return [];
    let splits = log.split(/\n|\r\n/);
    splits = splits.map(line => line.split(/\r/).pop()) as string[];
    if (splits.length > 1000) {
      splits = splits.slice(splits.length - 1000);
    }
    return splits;
  }, [log]);

  const handleScroll = () => {
    if (logRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logRef.current;
      setIsFollowing(scrollHeight - scrollTop - clientHeight < 10);
    }
  };

  useEffect(() => {
    if (logRef.current && isFollowing) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log, isFollowing]);

  // During deployment (no host linked), show synthetic deployment log
  if (!hostId) {
    return <DeploymentLog pod={pod} liveData={liveData} hostId={hostId} />;
  }

  if (remoteJobsStatus === 'loading') {
    return <DeploymentLog pod={pod} liveData={liveData} hostId={hostId} />;
  }

  if (remoteJobsStatus === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-400">
        <RefreshCw className="w-6 h-6 text-gray-500 mb-3" />
        <p className="text-sm">Could not connect to remote instance</p>
        <button
          onClick={onRetryRemoteJobs}
          className="mt-3 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!activeJob) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-400">
        <span className="text-2xl mb-3">&#x1f4ad;</span>
        <p className="text-sm">No training jobs running on this pod</p>
      </div>
    );
  }

  // Active job — show log viewer
  const statusColors: Record<string, string> = {
    running: 'bg-green-900 text-green-300',
    queued: 'bg-yellow-900 text-yellow-300',
    completed: 'bg-blue-900 text-blue-300',
    error: 'bg-red-900 text-red-300',
    stopped: 'bg-gray-700 text-gray-300',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">{activeJob.name}</span>
          <span
            className={classNames(
              'px-2 py-0.5 rounded-full text-xs',
              statusColors[activeJob.status] || 'bg-gray-700 text-gray-300',
            )}
          >
            {activeJob.status}
          </span>
        </div>
        <button
          onClick={() => setIsFollowing(!isFollowing)}
          className={classNames(
            'px-2.5 py-1 text-xs rounded-md transition-colors border',
            isFollowing
              ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
              : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white',
          )}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>

      {/* Log viewer */}
      <div
        ref={logRef}
        className="bg-gray-950 rounded-lg font-mono text-xs text-gray-300 overflow-y-auto max-h-[calc(100vh-14rem)] flex-1 p-4"
        onScroll={handleScroll}
      >
        {logStatus === 'loading' && (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading logs...
          </div>
        )}
        {logStatus === 'error' && <span className="text-red-400">Error loading logs</span>}
        {['success', 'refreshing'].includes(logStatus) && logLines.length === 0 && (
          <span className="text-gray-500">Waiting for log output...</span>
        )}
        {['success', 'refreshing'].includes(logStatus) && logLines.map((line, i) => <pre key={i}>{line}</pre>)}
      </div>
    </div>
  );
}
