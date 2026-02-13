'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RunPodPodInfo } from '@/hooks/useRunPodPods';
import { Cpu, DollarSign, Clock, ExternalLink, Terminal, Eye, EyeOff, Copy, Check } from 'lucide-react';
import classNames from 'classnames';

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

interface PodOverviewTabProps {
  pod: RunPodPodInfo;
  liveData: LivePodData | null;
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{label}</td>
      <td className="px-4 py-3 text-sm text-gray-100">{value}</td>
    </tr>
  );
}

function CopyableField({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <code
        className={classNames('text-sm text-gray-100 bg-gray-800 px-3 py-1.5 rounded-lg flex-1', mono && 'font-mono')}
      >
        {value}
      </code>
      <button
        onClick={handleCopy}
        className="p-1.5 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors"
        title="Copy to clipboard"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

// Infer deployment stage from available data
function getDeploymentStage(pod: RunPodPodInfo, liveData: LivePodData | null): number {
  if (pod.hostId) return 4; // Ready — host linked
  if (liveData?.runtime?.ports && liveData.runtime.ports.length > 0) return 3; // Starting container
  if (liveData?.runtime) return 2; // Pulling image
  return 1; // Initializing
}

const deploymentStages = [
  { label: 'Initializing', description: 'Allocating GPU resources' },
  { label: 'Pulling Image', description: 'Downloading container image' },
  { label: 'Starting', description: 'Container starting up' },
  { label: 'Ready', description: 'AI Toolkit connected' },
];

function DeploymentStepper({ stage }: { stage: number }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-4">Deployment Progress</h3>
      <div className="flex items-center justify-between">
        {deploymentStages.map((s, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < stage;
          const isActive = stepNum === stage;
          const isFuture = stepNum > stage;

          return (
            <div key={s.label} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center">
                <div
                  className={classNames(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors',
                    isCompleted && 'bg-green-600 border-green-600 text-white',
                    isActive && 'bg-blue-600 border-blue-600 text-white animate-pulse',
                    isFuture && 'bg-gray-800 border-gray-600 text-gray-500',
                  )}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
                </div>
                <span
                  className={classNames(
                    'text-xs mt-1.5 whitespace-nowrap',
                    isActive ? 'text-blue-400 font-medium' : isCompleted ? 'text-green-400' : 'text-gray-500',
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < deploymentStages.length - 1 && (
                <div
                  className={classNames(
                    'flex-1 h-0.5 mx-2 mt-[-1.25rem]',
                    isCompleted ? 'bg-green-600' : 'bg-gray-700',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PodOverviewTab({ pod, liveData }: PodOverviewTabProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const gpus = liveData?.runtime?.gpus;
  const isDeploying = pod.currentStatus === 'deploying';
  const deployStage = getDeploymentStage(pod, liveData);

  // Find SSH port from runtime ports
  const sshPort = liveData?.runtime?.ports?.find(p => p.privatePort === 22);
  const sshCommand = sshPort?.isIpPublic ? `ssh root@${sshPort.ip} -p ${sshPort.publicPort}` : null;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Quick Info Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs">Cost/hr</span>
          </div>
          <p className="text-lg font-medium text-gray-100">${pod.costPerHr.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs">Uptime</span>
          </div>
          <p className="text-lg font-medium text-gray-100">{formatUptime(pod.totalUptimeSeconds)}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs">Total Spend</span>
          </div>
          <p className="text-lg font-medium text-gray-100">${pod.estimatedSpend.toFixed(2)}</p>
        </div>
      </div>

      {/* Deployment Progress Stepper */}
      {isDeploying && <DeploymentStepper stage={deployStage} />}

      {/* Auth Password */}
      {pod.authPassword && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Pod Auth Password</h3>
          <p className="text-xs text-gray-400 mb-3">
            Used to authenticate with the AI Toolkit instance running on this pod.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={pod.authPassword}
                readOnly
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm font-mono text-gray-100 pr-10"
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <CopyButton value={pod.authPassword} />
          </div>
        </div>
      )}

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
                  <span>
                    GPU {i}
                    {gpus.length > 1 ? ` (${gpu.id})` : ''}
                  </span>
                  <span>
                    {gpu.gpuUtilPerc}% compute &middot; {gpu.memoryUtilPerc}% memory
                  </span>
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
              value={pod.instanceType === 'SPOT' ? `Spot (bid: $${pod.bidPerGpu.toFixed(2)}/hr per GPU)` : 'On-Demand'}
            />
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
            {pod.publicIp ? (
              <MetaRow label="Endpoint" value={`${pod.publicIp}:${pod.publicPort}`} />
            ) : (
              pod.currentStatus === 'running' && (
                <MetaRow label="Endpoint" value={`${pod.runpodId}-8675.proxy.runpod.net (proxy)`} />
              )
            )}
            <MetaRow label="Created" value={new Date(pod.createdAt).toLocaleString()} />
            {pod.terminatedAt && <MetaRow label="Terminated" value={new Date(pod.terminatedAt).toLocaleString()} />}
          </tbody>
        </table>
      </div>

      {/* External Links */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-300">Quick Links</h3>
        <div className="flex flex-col gap-2">
          <a
            href={`https://www.runpod.io/console/pods/${pod.runpodId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open in RunPod Console
          </a>
          {pod.currentStatus === 'running' && (
            <a
              href={`https://${pod.runpodId}-8675.proxy.runpod.net/`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open AI Toolkit (RunPod Proxy)
            </a>
          )}
          {sshCommand && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Terminal className="w-4 h-4" />
                SSH Command
              </div>
              <CopyableField value={sshCommand} />
            </div>
          )}
        </div>
      </div>

      {/* Host Link */}
      {pod.hostId && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Linked Host</h3>
          <div className="flex items-center gap-2">
            <span
              className={classNames(
                'w-2.5 h-2.5 rounded-full shrink-0',
                pod.currentStatus === 'running' ? 'bg-green-500' : 'bg-gray-500',
              )}
            />
            <span
              className={classNames('text-sm', pod.currentStatus === 'running' ? 'text-green-400' : 'text-gray-400')}
            >
              {pod.currentStatus === 'running' ? 'Connected' : 'Offline'}
            </span>
            <span className="text-gray-600">·</span>
            <button
              onClick={() => router.push(`/hosts/${pod.hostId}`)}
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              View host details
            </button>
          </div>
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
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}
