/** Returns API path prefix for local or remote data */
export function apiPrefix(hostId?: string | null): string {
  if (!hostId) return '';
  return `/api/hosts/${hostId}/proxy`;
}

/** Builds a full API path: /api/foo or /api/hosts/{id}/proxy/foo */
export function proxyApiPath(path: string, hostId?: string | null): string {
  if (!hostId) return path;
  // Strip leading /api/ from path, proxy route expects just the remainder
  const stripped = path.replace(/^\/api\//, '');
  return `/api/hosts/${hostId}/proxy/${stripped}`;
}
