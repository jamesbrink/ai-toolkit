import { JobConfig, UnifiedJob } from '@/types';
import { Job } from '@/server/prismaTypes';
import { apiClient } from '@/utils/api';

type AnyJob = Job | UnifiedJob;

export const startJob = (jobID: string, restart = false) => {
  const url = restart ? `/api/jobs/${jobID}/start?restart=true` : `/api/jobs/${jobID}/start`;
  return new Promise<void>((resolve, reject) => {
    apiClient
      .get(url)
      .then(res => res.data)
      .then(() => {
        resolve();
      })
      .catch(error => {
        console.error('Error starting job:', error);
        reject(error);
      });
  });
};

export const getCheckpointStep = (jobID: string): Promise<number | null> => {
  return apiClient
    .get(`/api/jobs/${jobID}/checkpoint-step`)
    .then(res => res.data?.step ?? null)
    .catch(() => null);
};

export const getConfigOverrides = (jobID: string): Promise<Record<string, number>> => {
  return apiClient
    .get(`/api/jobs/${jobID}/config-overrides`)
    .then(res => res.data?.overrides ?? {})
    .catch(() => ({}));
};

export const setConfigOverrides = (jobID: string, overrides: Record<string, number>): Promise<void> => {
  return apiClient.patch(`/api/jobs/${jobID}/config-overrides`, { overrides }).then(() => {});
};

export const clearConfigOverrides = (jobID: string): Promise<void> => {
  return apiClient.delete(`/api/jobs/${jobID}/config-overrides`).then(() => {});
};

export const stopJob = (jobID: string) => {
  return new Promise<void>((resolve, reject) => {
    apiClient
      .get(`/api/jobs/${jobID}/stop`)
      .then(res => res.data)
      .then(() => {
        resolve();
      })
      .catch(error => {
        console.error('Error stopping job:', error);
        reject(error);
      });
  });
};

export const deleteJob = (jobID: string) => {
  return new Promise<void>((resolve, reject) => {
    apiClient
      .get(`/api/jobs/${jobID}/delete`)
      .then(res => res.data)
      .then(() => {
        resolve();
      })
      .catch(error => {
        console.error('Error deleting job:', error);
        reject(error);
      });
  });
};

export const markJobAsStopped = (jobID: string) => {
  return new Promise<void>((resolve, reject) => {
    apiClient
      .get(`/api/jobs/${jobID}/mark_stopped`)
      .then(res => res.data)
      .then(() => {
        resolve();
      })
      .catch(error => {
        console.error('Error marking job as stopped:', error);
        reject(error);
      });
  });
};

export const getJobConfig = (job: AnyJob): JobConfig | null => {
  try {
    return JSON.parse(job.job_config) as JobConfig;
  } catch {
    return null;
  }
};

export const getAvaliableJobActions = (job: AnyJob) => {
  const jobConfig = getJobConfig(job);
  const isStopping = job.stop && job.status === 'running';
  const canDelete = ['queued', 'completed', 'stopped', 'error'].includes(job.status) && !isStopping;
  const canEdit = ['queued', 'completed', 'stopped', 'error'].includes(job.status) && !isStopping;
  const canRemoveFromQueue = job.status === 'queued';
  const canStop = job.status === 'running' && !isStopping;
  let canStart = ['stopped', 'error'].includes(job.status) && !isStopping;
  // can resume if more steps were added
  if (job.status === 'completed' && jobConfig && jobConfig.config.process[0].train.steps > job.step && !isStopping) {
    canStart = true;
  }
  return { canDelete, canEdit, canStop, canStart, canRemoveFromQueue };
};

export const getTotalSteps = (job: AnyJob) => {
  const jobConfig = getJobConfig(job);
  return jobConfig?.config.process[0].train.steps ?? 0;
};

export const hasValidConfig = (job: AnyJob): boolean => {
  return getJobConfig(job) !== null;
};
