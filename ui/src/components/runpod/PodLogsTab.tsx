'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useJobLog from '@/hooks/useJobLog';
import { RemoteJob } from '@/hooks/useRemoteJobs';
import { Loader2, RefreshCw } from 'lucide-react';
import classNames from 'classnames';

interface PodLogsTabProps {
  hostId: string | null;
  activeJob: RemoteJob | null;
  remoteJobsStatus: 'idle' | 'loading' | 'success' | 'error';
  onRetryRemoteJobs: () => void;
}

function EmptyState({ icon, message, action }: { icon: React.ReactNode; message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-400">
      <div className="mb-3">{icon}</div>
      <p className="text-sm">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export default function PodLogsTab({ hostId, activeJob, remoteJobsStatus, onRetryRemoteJobs }: PodLogsTabProps) {
  // Only enable the log hook when we have both a host and an active job
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

  // State machine for content
  if (!hostId) {
    return (
      <EmptyState
        icon={<Loader2 className="w-6 h-6 animate-spin text-gray-500" />}
        message="Waiting for pod to come online..."
      />
    );
  }

  if (remoteJobsStatus === 'loading') {
    return (
      <EmptyState
        icon={<Loader2 className="w-6 h-6 animate-spin text-gray-500" />}
        message="Connecting to remote instance..."
      />
    );
  }

  if (remoteJobsStatus === 'error') {
    return (
      <EmptyState
        icon={<RefreshCw className="w-6 h-6 text-gray-500" />}
        message="Could not connect to remote instance"
        action={
          <button
            onClick={onRetryRemoteJobs}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            Retry
          </button>
        }
      />
    );
  }

  if (!activeJob) {
    return (
      <EmptyState icon={<span className="text-2xl">&#x1f4ad;</span>} message="No training jobs running on this pod" />
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
