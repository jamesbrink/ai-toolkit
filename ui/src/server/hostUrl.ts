/**
 * Build a base URL for reaching a host.
 *
 * Convention: port 443 means HTTPS (RunPod proxy hosts).
 * All other ports use plain HTTP (LAN hosts).
 */
export function buildHostBaseUrl(address: string, port: number): string {
  if (port === 443) return `https://${address}`;
  return `http://${address}:${port}`;
}
