import { Job } from '@/server/prismaTypes';
import { UnifiedJob } from '@/types';
import useGPUInfo from '@/hooks/useGPUInfo';
import useRemoteGPUInfo from '@/hooks/useRemoteGPUInfo';
import useCPUInfo from '@/hooks/useCPUInfo';
import GPUWidget from '@/components/GPUWidget';
import CPUWidget from '@/components/CPUWidget';
import FilesWidget from '@/components/FilesWidget';
import { getTotalSteps } from '@/utils/jobs';
import { Cpu, HardDrive, Info, Gauge, Bot } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import useJobLog from '@/hooks/useJobLog';
import { useClaudeChat } from '@/components/claude/ClaudeChatContext';

interface JobOverviewProps {
  job: Job | UnifiedJob;
  hostId?: string | null;
}

export default function JobOverview({ job, hostId }: JobOverviewProps) {
  const isMpsJob = job.gpu_ids === 'mps';
  const gpuIds = useMemo(
    () => (isMpsJob ? null : job.gpu_ids.split(',').map(id => parseInt(id))),
    [job.gpu_ids, isMpsJob],
  );
  const { log, status: statusLog } = useJobLog(job.id, 2000, hostId);
  const logRef = useRef<HTMLDivElement>(null);
  // Track whether we should auto-scroll to bottom
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

  // Local GPU/CPU hooks (no-op when hostId is set)
  const localGpu = useGPUInfo(hostId ? null : gpuIds, hostId ? null : 5000);
  // Remote GPU hook (no-op when hostId is not set)
  const remoteGpu = useRemoteGPUInfo(hostId ?? null, hostId ? 5000 : null);
  const gpuList = hostId ? remoteGpu.gpuList : localGpu.gpuList;
  const isGPUInfoLoaded = hostId ? remoteGpu.isLoaded : localGpu.isGPUInfoLoaded;

  const { cpuInfo, isCPUInfoLoaded } = useCPUInfo(5000, hostId);
  const { isConfigured, openPanel, sendMessage, setContext } = useClaudeChat();

  // Provide job context to Claude when log updates
  useEffect(() => {
    if (isConfigured && log) {
      const logLines = log
        .split(/\n|\r\n/)
        .slice(-200)
        .join('\n');
      setContext({
        page: `/jobs/${job.id}`,
        jobData: { name: job.name, status: job.status, step: job.step, gpu_ids: job.gpu_ids },
        logTail: logLines,
      });
    }
  }, [isConfigured, log, job, setContext]);

  const handleAnalyze = () => {
    const logTail = log
      .split(/\n|\r\n/)
      .slice(-200)
      .join('\n');
    setContext({
      page: `/jobs/${job.id}`,
      jobData: { name: job.name, status: job.status, step: job.step, gpu_ids: job.gpu_ids },
      logTail,
    });
    openPanel();
    sendMessage(
      `Analyze this training job. The job "${job.name}" is ${job.status} at step ${job.step}. Look at the recent log output and tell me: 1) Is training progressing normally? 2) Any errors or warnings? 3) Suggestions for improvement.`,
    );
  };
  const totalSteps = getTotalSteps(job);
  const progress = (job.step / totalSteps) * 100;
  const isStopping = job.stop && job.status === 'running';

  const logLines: string[] = useMemo(() => {
    // split at line breaks on \n or \r\n but not \r
    let splits: string[] = log.split(/\n|\r\n/);

    splits = splits.map(line => {
      return line.split(/\r/).pop();
    }) as string[];

    // only return last 100 lines max
    const maxLines = 1000;
    if (splits.length > maxLines) {
      splits = splits.slice(splits.length - maxLines);
    }

    return splits;
  }, [log]);

  // Handle scroll events to determine if user has scrolled away from bottom
  const handleScroll = () => {
    if (logRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logRef.current;
      // Consider "at bottom" if within 10 pixels of the bottom
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
      setIsScrolledToBottom(isAtBottom);
    }
  };

  // Auto-scroll to bottom only if we were already at the bottom
  useEffect(() => {
    if (logRef.current && isScrolledToBottom) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log, isScrolledToBottom]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running':
        return 'bg-emerald-500/10 text-emerald-500';
      case 'stopping':
        return 'bg-amber-500/10 text-amber-500';
      case 'stopped':
        return 'bg-gray-500/10 text-gray-400';
      case 'completed':
        return 'bg-blue-500/10 text-blue-500';
      case 'error':
        return 'bg-rose-500/10 text-rose-500';
      default:
        return 'bg-gray-500/10 text-gray-400';
    }
  };

  const displayStatus = isStopping ? 'stopping' : job.status;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {/* Job Information Panel */}
      <div className="md:col-span-2 bg-white dark:bg-zinc-900 rounded-xl shadow-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 flex flex-col">
        <div className="bg-zinc-50 dark:bg-zinc-800 px-4 py-3 flex items-center justify-between">
          <h2 className="text-zinc-900 dark:text-gray-100">
            <Info className="w-5 h-5 mr-2 -mt-1 text-amber-500 dark:text-amber-400 inline-block" /> {job.info}
          </h2>
          <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(displayStatus)}`}>{displayStatus}</span>
        </div>

        <div className="p-4 space-y-6 flex flex-col flex-grow">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500 dark:text-gray-400">Progress</span>
              <span className="text-zinc-700 dark:text-gray-200">
                Step {job.step} of {totalSteps}
              </span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-gray-800 rounded-full h-2">
              <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Job Info Grid */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            <div className="flex items-center space-x-4">
              <HardDrive className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-xs text-zinc-500 dark:text-gray-400">Job Name</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-gray-200">{job.name}</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Cpu className="w-5 h-5 text-purple-400" />
              <div>
                <p className="text-xs text-zinc-500 dark:text-gray-400">{isMpsJob ? 'Device' : 'Assigned GPUs'}</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-gray-200">
                  {isMpsJob ? 'Apple Silicon (MPS)' : `GPUs: ${job.gpu_ids}`}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Gauge className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-xs text-zinc-500 dark:text-gray-400">Speed</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-gray-200">
                  {job.speed_string == '' ? '?' : job.speed_string}
                </p>
              </div>
            </div>
          </div>

          {/* Log - Now using flex-grow to fill remaining space */}
          <div className="bg-zinc-100 dark:bg-gray-950 rounded-lg p-4 relative flex-grow min-h-60">
            {isConfigured && (
              <button
                onClick={handleAnalyze}
                className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1 text-xs bg-white dark:bg-gray-800 hover:bg-zinc-50 dark:hover:bg-gray-700 text-zinc-600 dark:text-gray-300 hover:text-zinc-900 dark:hover:text-gray-100 rounded-md transition-colors border border-zinc-300 dark:border-gray-700"
                title="Analyze logs with Claude"
              >
                <Bot className="w-3.5 h-3.5" />
                Analyze
              </button>
            )}
            <div
              ref={logRef}
              className="text-xs text-zinc-600 dark:text-gray-300 absolute inset-0 p-4 overflow-y-auto"
              onScroll={handleScroll}
            >
              {statusLog === 'loading' && 'Loading log...'}
              {statusLog === 'error' && 'Error loading log'}
              {['success', 'refreshing'].includes(statusLog) && (
                <div>
                  {logLines.map((line, index) => {
                    return <pre key={index}>{line}</pre>;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* GPU Widget Panel */}
      <div className="md:col-span-1">
        <div>{isCPUInfoLoaded && cpuInfo && <CPUWidget cpu={cpuInfo} />}</div>
        <div className="mt-4">{isGPUInfoLoaded && gpuList.length > 0 && <GPUWidget gpu={gpuList[0]} />}</div>
        <div className="mt-4">
          <FilesWidget jobID={job.id} hostId={hostId} />
        </div>
      </div>
    </div>
  );
}
