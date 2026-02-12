'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { defaultJobConfig, defaultDatasetConfig, migrateJobConfig } from './jobConfig';
import { jobTypeOptions } from './options';
import { JobConfig } from '@/types';
import { objectCopy } from '@/utils/basic';
import { useNestedState } from '@/utils/hooks';
import { SelectInput } from '@/components/formInputs';
import useSettings from '@/hooks/useSettings';
import useGPUInfo from '@/hooks/useGPUInfo';
import useDatasetList from '@/hooks/useDatasetList';
import useHostList from '@/hooks/useHostList';
import useRemoteGPUInfo from '@/hooks/useRemoteGPUInfo';
import useRemoteSettings from '@/hooks/useRemoteSettings';
import useRemoteDatasetList from '@/hooks/useRemoteDatasetList';
import path from 'path';
import { TopBar, MainContent } from '@/components/layout';
import { Button } from '@headlessui/react';
import { FaChevronLeft } from 'react-icons/fa';
import SimpleJob from './SimpleJob';
import AdvancedJob from './AdvancedJob';
import ErrorBoundary from '@/components/ErrorBoundary';
import { apiClient } from '@/utils/api';
import { remoteApi } from '@/utils/remoteApi';
import { startQueueOnHost } from '@/utils/remoteActions';
import { useClaudeChat } from '@/components/claude/ClaudeChatContext';
import { configTools } from '@/components/claude/tools/configTools';

const isDev = process.env.NODE_ENV === 'development';

export default function TrainingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get('id');
  const cloneId = searchParams.get('cloneId');
  const sourceHostId = searchParams.get('sourceHostId');
  const [gpuIDs, setGpuIDs] = useState<string | null>(null);
  const [showAdvancedView, setShowAdvancedView] = useState(false);

  // Target host: 'local' or a hostId
  const [targetHost, setTargetHost] = useState<string>('local');
  const remoteHostId = targetHost !== 'local' ? targetHost : null;

  // Local data sources
  const { settings: localSettings, isSettingsLoaded: localSettingsLoaded } = useSettings();
  const { gpuList: localGpuList, isGPUInfoLoaded: localGpuLoaded, deviceType: localDeviceType } = useGPUInfo();
  const { datasets: localDatasets, status: localDatasetStatus } = useDatasetList();

  // Remote data sources (only fetch when targeting a remote host)
  const { settings: remoteSettings, isSettingsLoaded: remoteSettingsLoaded } = useRemoteSettings(remoteHostId);
  const {
    gpuList: remoteGpuList,
    isLoaded: remoteGpuLoaded,
    deviceType: remoteDeviceType,
  } = useRemoteGPUInfo(remoteHostId);
  const { datasets: remoteDatasets, status: remoteDatasetStatus } = useRemoteDatasetList(remoteHostId);

  // Active data sources — switch based on target
  const activeSettings = remoteHostId ? remoteSettings : localSettings;
  const activeSettingsLoaded = remoteHostId ? remoteSettingsLoaded : localSettingsLoaded;
  const activeGpuList = remoteHostId ? remoteGpuList : localGpuList;
  const activeGpuLoaded = remoteHostId ? remoteGpuLoaded : localGpuLoaded;
  const activeDeviceType = remoteHostId ? remoteDeviceType : localDeviceType;
  const activeDatasets = remoteHostId ? remoteDatasets : localDatasets;
  const activeDatasetStatus = remoteHostId ? remoteDatasetStatus : localDatasetStatus;

  // Host list for target selector
  const { hosts } = useHostList();
  const onlineHosts = useMemo(() => hosts.filter(h => h.isOnline), [hosts]);

  const targetHostOptions = useMemo(() => {
    const options = [{ value: 'local', label: 'Local (this machine)' }];
    for (const host of onlineHosts) {
      const deviceLabel = host.deviceType === 'mps' ? 'mps' : host.deviceType === 'nvidia' ? 'nvidia' : '';
      options.push({
        value: host.id,
        label: `${host.name}${deviceLabel ? ` (${deviceLabel})` : ''}`,
      });
    }
    return options;
  }, [onlineHosts]);

  const [datasetOptions, setDatasetOptions] = useState<{ value: string; label: string }[]>([]);

  const [jobConfig, setJobConfig] = useNestedState<JobConfig>(objectCopy(defaultJobConfig));
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const { setContext, setTools, isConfigured } = useClaudeChat();

  // Provide config tools and page context to Claude chat
  useEffect(() => {
    if (isConfigured) {
      setTools(configTools);
      return () => setTools([]);
    }
  }, [isConfigured, setTools]);

  useEffect(() => {
    if (isConfigured) {
      setContext({ page: '/jobs/new', jobConfig, deviceType: activeDeviceType });
    }
  }, [jobConfig, activeDeviceType, isConfigured, setContext]);

  // Listen for config changes from Claude's ConfigProposal
  useEffect(() => {
    const handler = (e: Event) => {
      const { path, value } = (e as CustomEvent).detail;
      setJobConfig(value, path);
    };
    window.addEventListener('claude-config-change', handler);
    return () => window.removeEventListener('claude-config-change', handler);
  }, [setJobConfig]);

  // Build dataset options from active source
  useEffect(() => {
    if (!activeSettingsLoaded) return;
    if (activeDatasetStatus !== 'success') return;

    const opts = activeDatasets.map(d => ({
      value: path.join(activeSettings.DATASETS_FOLDER, d.name),
      label: d.name,
    }));
    setDatasetOptions(opts);
    const defaultDatasetPath = defaultDatasetConfig.folder_path;

    for (let i = 0; i < jobConfig.config.process[0].datasets.length; i++) {
      const dataset = jobConfig.config.process[0].datasets[i];
      if (dataset.folder_path === defaultDatasetPath) {
        if (opts.length > 0) {
          setJobConfig(opts[0].value, `config.process[0].datasets[${i}].folder_path`);
        }
      }
    }
  }, [activeDatasets, activeSettings, activeSettingsLoaded, activeDatasetStatus]);

  // clone existing job (local or remote)
  useEffect(() => {
    if (cloneId) {
      const request = sourceHostId
        ? remoteApi.get(sourceHostId, `jobs?id=${cloneId}`)
        : apiClient.get(`/api/jobs?id=${cloneId}`);

      request
        .then(res => res.data)
        .then(data => {
          console.log('Clone Training:', data);
          setGpuIDs(data.gpu_ids);
          const newJobConfig = migrateJobConfig(JSON.parse(data.job_config));
          newJobConfig.config.name = `${newJobConfig.config.name}_copy`;
          setJobConfig(newJobConfig);
        })
        .catch(error => console.error('Error fetching training:', error));
    }
  }, [cloneId, sourceHostId]);

  useEffect(() => {
    if (runId) {
      apiClient
        .get(`/api/jobs?id=${runId}`)
        .then(res => res.data)
        .then(data => {
          console.log('Training:', data);
          setGpuIDs(data.gpu_ids);
          setJobConfig(migrateJobConfig(JSON.parse(data.job_config)));
        })
        .catch(error => console.error('Error fetching training:', error));
    }
  }, [runId]);

  // Auto-select first GPU when data loads or target changes
  useEffect(() => {
    if (activeGpuLoaded) {
      if (activeDeviceType === 'mps') {
        setGpuIDs('mps');
      } else if (activeGpuList.length > 0) {
        setGpuIDs(`${activeGpuList[0].index}`);
      }
    }
  }, [activeGpuList, activeGpuLoaded, activeDeviceType, targetHost]);

  // Auto-apply MPS defaults for new jobs
  useEffect(() => {
    if (activeGpuLoaded && activeDeviceType === 'mps' && !runId && !cloneId) {
      setJobConfig('mps', 'config.process[0].device');
      if (jobConfig.config.process[0].train.optimizer === 'adamw8bit') {
        setJobConfig('adamw', 'config.process[0].train.optimizer');
      }
      // qint8 backward crashes on MPS — disable transformer quantization
      setJobConfig(false, 'config.process[0].model.quantize');
      // Text encoder quantization is safe (inference-only)
      setJobConfig(true, 'config.process[0].model.quantize_te');
      setJobConfig('qint8', 'config.process[0].model.qtype_te');
      // Gradual model loading avoids peak memory on unified memory
      setJobConfig(true, 'config.process[0].model.low_vram');
    }
  }, [activeGpuLoaded, activeDeviceType, targetHost]);

  // Set device in config based on active device type
  useEffect(() => {
    if (activeGpuLoaded && !runId && !cloneId) {
      if (activeDeviceType === 'mps') {
        setJobConfig('mps', 'config.process[0].device');
      } else if (activeDeviceType === 'nvidia') {
        setJobConfig('cuda', 'config.process[0].device');
      }
    }
  }, [activeGpuLoaded, activeDeviceType, targetHost]);

  // Set training folder from active settings
  useEffect(() => {
    if (activeSettingsLoaded) {
      setJobConfig(activeSettings.TRAINING_FOLDER, 'config.process[0].training_folder');
    }
  }, [activeSettings, activeSettingsLoaded]);

  /** Check if datasets referenced in the job config exist on the remote host */
  const checkRemoteDatasets = (): string[] => {
    if (!remoteHostId) return [];
    const remoteDatasetNames = new Set(activeDatasets.map(d => d.name));
    const missing: string[] = [];
    for (const ds of jobConfig.config.process[0].datasets) {
      const dsName = ds.folder_path?.split('/').pop();
      if (dsName && !remoteDatasetNames.has(dsName)) {
        missing.push(dsName);
      }
    }
    return missing;
  };

  const submitJob = async () => {
    setStatus('saving');

    const payload = {
      id: runId,
      name: jobConfig.config.name,
      gpu_ids: gpuIDs,
      job_config: jobConfig,
    };

    try {
      let jobId: string;

      if (remoteHostId) {
        // Submit job to remote host
        const res = await remoteApi.post(remoteHostId, 'jobs', payload);
        jobId = res.data.id;
        // Auto-start the remote queue
        try {
          await startQueueOnHost({ type: 'remote', hostId: remoteHostId }, gpuIDs || '0');
        } catch (e) {
          console.error('Failed to auto-start remote queue:', e);
        }
        setStatus('success');
        router.push(`/jobs/${jobId}?hostId=${remoteHostId}`);
      } else {
        // Submit job locally
        const res = await apiClient.post('/api/jobs', payload);
        jobId = runId || res.data.id;
        setStatus('success');
        router.push(`/jobs/${jobId}`);
      }
    } catch (error: any) {
      if (error.response?.status === 409) {
        alert('Training name already exists. Please choose a different name.');
      } else {
        alert('Failed to save job. Please try again.');
      }
      console.log('Error saving training:', error);
    } finally {
      setTimeout(() => {
        setStatus('idle');
      }, 2000);
    }
  };

  const saveJob = async () => {
    if (status === 'saving') return;

    // Pre-flight check: warn about missing datasets on remote host
    if (remoteHostId) {
      const missing = checkRemoteDatasets();
      if (missing.length > 0) {
        const targetName = onlineHosts.find(h => h.id === remoteHostId)?.name || 'the remote host';
        const proceed = window.confirm(
          `The following datasets were not found on ${targetName}:\n\n` +
            missing.map(n => `  - ${n}`).join('\n') +
            `\n\nYou can push them from the Datasets page. Create the job anyway?`,
        );
        if (!proceed) return;
      }
    }

    submitJob();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    saveJob();
  };

  return (
    <>
      <TopBar>
        <div>
          <Button className="text-gray-300 px-3 mt-1" onClick={() => history.back()}>
            <FaChevronLeft />
          </Button>
        </div>
        <div>
          <h1 className="text-lg">{runId ? 'Edit Training Job' : 'New Training Job'}</h1>
        </div>
        <div className="flex-1"></div>

        {/* Target host selector — shown when remote hosts are available and not editing an existing job */}
        {onlineHosts.length > 0 && !runId && (
          <>
            <div>
              <SelectInput value={targetHost} onChange={value => setTargetHost(value)} options={targetHostOptions} />
            </div>
            <div className="mx-4 bg-gray-200 dark:bg-gray-800 w-1 h-6"></div>
          </>
        )}

        {showAdvancedView && (
          <>
            <div>
              <SelectInput
                value={`${gpuIDs}`}
                onChange={value => setGpuIDs(value)}
                options={
                  activeDeviceType === 'mps'
                    ? [{ value: 'mps', label: 'Apple Silicon (MPS)' }]
                    : activeGpuList.map((gpu: any) => ({ value: `${gpu.index}`, label: `GPU #${gpu.index}` }))
                }
              />
            </div>
            <div className="mx-4 bg-gray-200 dark:bg-gray-800 w-1 h-6"></div>
          </>
        )}
        {!showAdvancedView && (
          <>
            <div>
              <SelectInput
                value={`${jobConfig?.config.process[0].type}`}
                onChange={value => {
                  // undo current job type changes
                  const currentOption = jobTypeOptions.find(
                    option => option.value === jobConfig?.config.process[0].type,
                  );
                  if (currentOption && currentOption.onDeactivate) {
                    setJobConfig(currentOption.onDeactivate(objectCopy(jobConfig)));
                  }
                  const option = jobTypeOptions.find(option => option.value === value);
                  if (option) {
                    if (option.onActivate) {
                      setJobConfig(option.onActivate(objectCopy(jobConfig)));
                    }
                    jobTypeOptions.forEach(opt => {
                      if (opt.value !== option.value && opt.onDeactivate) {
                        setJobConfig(opt.onDeactivate(objectCopy(jobConfig)));
                      }
                    });
                  }
                  setJobConfig(value, 'config.process[0].type');
                }}
                options={jobTypeOptions}
              />
            </div>
            <div className="mx-4 bg-gray-200 dark:bg-gray-800 w-1 h-6"></div>
          </>
        )}

        <div className="pr-2 shrink-0">
          <Button
            className="text-gray-200 bg-gray-800 px-3 py-1 rounded-md whitespace-nowrap"
            onClick={() => setShowAdvancedView(!showAdvancedView)}
          >
            {showAdvancedView ? 'Show Simple' : 'Show Advanced'}
          </Button>
        </div>
        <div className="shrink-0">
          <Button
            className="text-gray-200 bg-green-800 px-3 py-1 rounded-md whitespace-nowrap"
            onClick={() => saveJob()}
            disabled={status === 'saving'}
          >
            {status === 'saving' ? 'Saving...' : runId ? 'Update Job' : 'Create Job'}
          </Button>
        </div>
      </TopBar>

      {showAdvancedView ? (
        <div className="pt-[48px] absolute top-0 left-0 w-full h-full overflow-auto">
          <AdvancedJob
            jobConfig={jobConfig}
            setJobConfig={setJobConfig}
            status={status}
            handleSubmit={handleSubmit}
            runId={runId}
            gpuIDs={gpuIDs}
            setGpuIDs={setGpuIDs}
            gpuList={activeGpuList}
            datasetOptions={datasetOptions}
            settings={activeSettings}
            deviceType={activeDeviceType}
          />
        </div>
      ) : (
        <MainContent>
          <ErrorBoundary
            fallback={
              <div className="flex items-center justify-center h-64 text-lg text-red-600 font-medium bg-red-100 dark:bg-red-900/20 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg">
                Advanced job detected. Please switch to advanced view to continue.
              </div>
            }
          >
            <SimpleJob
              jobConfig={jobConfig}
              setJobConfig={setJobConfig}
              status={status}
              handleSubmit={handleSubmit}
              runId={runId}
              gpuIDs={gpuIDs}
              setGpuIDs={setGpuIDs}
              gpuList={activeGpuList}
              datasetOptions={datasetOptions}
              deviceType={activeDeviceType}
            />
          </ErrorBoundary>

          <div className="pt-20"></div>
        </MainContent>
      )}
    </>
  );
}
