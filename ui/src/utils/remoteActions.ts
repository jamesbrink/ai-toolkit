import { DataSource } from '@/types';
import { apiClient } from './api';
import { remoteApi } from './remoteApi';

function routeAction(source: DataSource, localPath: string) {
  if (source.type === 'remote' && source.hostId) {
    // Strip leading /api/ for the proxy route
    const stripped = localPath.replace(/^\/api\//, '');
    return remoteApi.get(source.hostId, stripped);
  }
  return apiClient.get(localPath);
}

export function routePost(source: DataSource, localPath: string, data?: unknown) {
  if (source.type === 'remote' && source.hostId) {
    const stripped = localPath.replace(/^\/api\//, '');
    return remoteApi.post(source.hostId, stripped, data);
  }
  return apiClient.post(localPath, data);
}

// Job actions
export const startJobOnHost = (source: DataSource, jobId: string, restart = false) => {
  const url = restart ? `/api/jobs/${jobId}/start?restart=true` : `/api/jobs/${jobId}/start`;
  return routeAction(source, url);
};

export const stopJobOnHost = (source: DataSource, jobId: string) => routeAction(source, `/api/jobs/${jobId}/stop`);

export const deleteJobOnHost = (source: DataSource, jobId: string) => routeAction(source, `/api/jobs/${jobId}/delete`);

export const markJobAsStoppedOnHost = (source: DataSource, jobId: string) =>
  routeAction(source, `/api/jobs/${jobId}/mark_stopped`);

// Queue actions
export const startQueueOnHost = (source: DataSource, gpuIds: string) =>
  routeAction(source, `/api/queue/${gpuIds}/start`);

export const stopQueueOnHost = (source: DataSource, gpuIds: string) => routeAction(source, `/api/queue/${gpuIds}/stop`);
