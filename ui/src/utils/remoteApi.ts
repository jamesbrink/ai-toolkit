import { apiClient } from './api';

export const remoteApi = {
  get: (hostId: string, path: string) => apiClient.get(`/api/hosts/${hostId}/proxy/${path}`),
  post: (hostId: string, path: string, data: any) => apiClient.post(`/api/hosts/${hostId}/proxy/${path}`, data),
};

export function getImageUrlPrefix(hostId?: string | null): string {
  return hostId ? `/api/hosts/${hostId}/proxy/img/` : '/api/img/';
}

export function getFileUrlPrefix(hostId?: string | null): string {
  return hostId ? `/api/hosts/${hostId}/proxy/files/` : '/api/files/';
}
