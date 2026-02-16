import prisma from '../prisma';
import { buildHostBaseUrl } from '../../src/server/hostUrl';
import { detectDeviceType, getPrimaryLocalAddress } from '../../src/server/networkUtils';
import os from 'os';
import { randomUUID } from 'crypto';

const RUNPOD_API_URL = 'https://api.runpod.io/graphql';
const HEALTH_CHECK_TIMEOUT = 10000;
const PROBE_TIMEOUT = 5000;

interface RunPodGraphQLResponse {
  data?: { pod: RunPodPodResponse };
  errors?: Array<{ message: string }>;
}

interface RunPodPodResponse {
  id: string;
  desiredStatus: string;
  costPerHr: number;
  runtime: {
    uptimeInSeconds: number;
    ports: Array<{
      ip: string;
      isIpPublic: boolean;
      privatePort: number;
      publicPort: number;
    }> | null;
  } | null;
}

async function getRunPodApiKey(): Promise<string> {
  const row = await prisma.settings.findFirst({ where: { key: 'RUNPOD_API_KEY' } });
  return (row?.value && row.value !== '' ? row.value : process.env.RUNPOD_API_KEY) || '';
}

async function fetchPodStatus(apiKey: string, runpodId: string): Promise<RunPodPodResponse | null> {
  try {
    const response = await fetch(RUNPOD_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: `query ($input: PodFilter!) { pod(input: $input) { id desiredStatus costPerHr runtime { uptimeInSeconds ports { ip isIpPublic privatePort publicPort } } } }`,
        variables: { input: { podId: runpodId } },
      }),
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as RunPodGraphQLResponse;
    return json.data?.pod ?? null;
  } catch {
    return null;
  }
}

interface ProbeIdentity {
  instanceId: string;
  deviceType?: string;
  gpuSummary?: string;
}

async function probeInstance(baseUrl: string, authToken: string): Promise<ProbeIdentity | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT);

    const response = await fetch(`${baseUrl}/api/hosts/identify`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Try to reach a RunPod pod via direct public IP first, then fall back
 * to the RunPod proxy URL (https://{podId}-8675.proxy.runpod.net/).
 * Returns the identity plus the address/port that succeeded.
 */
async function probeRunPodInstance(
  runpodId: string,
  publicIp: string | null,
  publicPort: number | null,
  authToken: string,
): Promise<{ identity: ProbeIdentity; address: string; port: number } | null> {
  // Try direct IP first (faster, lower latency on same network)
  if (publicIp && publicPort) {
    const directUrl = buildHostBaseUrl(publicIp, publicPort);
    const identity = await probeInstance(directUrl, authToken);
    if (identity) {
      return { identity, address: publicIp, port: publicPort };
    }
  }

  // Fall back to RunPod proxy URL
  const proxyHost = `${runpodId}-8675.proxy.runpod.net`;
  const proxyUrl = `https://${proxyHost}`;
  const identity = await probeInstance(proxyUrl, authToken);
  if (identity) {
    return { identity, address: proxyHost, port: 443 };
  }

  return null;
}

interface GossipPeer {
  instanceId: string;
  name: string;
  address: string;
  port: number;
  deviceType?: string;
  canReachBack?: boolean;
}

/**
 * Register the hub on a RunPod pod so the pod knows about us and our network.
 * Mirrors the bidirectional handshake from manual host addition (POST /api/hosts).
 */
async function registerHubOnPod(podBaseUrl: string, podAuthToken: string): Promise<void> {
  try {
    let ourSetting = await prisma.settings.findUnique({ where: { key: 'INSTANCE_ID' } });
    if (!ourSetting) {
      ourSetting = await prisma.settings.create({ data: { key: 'INSTANCE_ID', value: randomUUID() } });
    }
    const ourPort = parseInt(process.env.PORT || '8675', 10);
    const ourAddress = getPrimaryLocalAddress();
    const ourDeviceType = await detectDeviceType();
    const ourAuth = process.env.AI_TOOLKIT_AUTH || '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
    await fetch(`${podBaseUrl}/api/hosts/register`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${podAuthToken}`,
      },
      body: JSON.stringify({
        instanceId: ourSetting.value,
        name: os.hostname(),
        hostname: os.hostname(),
        address: ourAddress,
        port: ourPort,
        deviceType: ourDeviceType,
        authToken: ourAuth,
      }),
    });
    clearTimeout(timeout);
    console.log(`[RunPod] Registered hub on pod at ${podBaseUrl}`);
  } catch {
    // Registration failed (old image, firewall, etc.) — continue silently
  }
}

/**
 * Push our peer list to a RunPod pod via gossip health endpoint.
 * This lets the pod learn about all hosts on the hub's network.
 */
async function gossipWithPod(podBaseUrl: string, podAuthToken: string, peers: GossipPeer[]): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
    await fetch(`${podBaseUrl}/api/hosts/health`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${podAuthToken}`,
      },
      body: JSON.stringify({ peers }),
    });
    clearTimeout(timeout);
  } catch {
    // Gossip failed — non-critical
  }
}

/**
 * Build the current peer list for gossip exchange (non-hidden, online hosts, no auth tokens).
 */
async function buildPeerList(): Promise<GossipPeer[]> {
  const gossipSetting = await prisma.settings.findUnique({ where: { key: 'GOSSIP_ENABLED' } });
  const gossipEnabled = !gossipSetting || gossipSetting.value !== 'false';
  if (!gossipEnabled) return [];

  const onlineHosts = await prisma.host.findMany({
    where: { isHidden: false, isOnline: true },
    select: { instanceId: true, name: true, address: true, port: true, deviceType: true, canReachBack: true },
  });
  return onlineHosts.map(h => ({
    instanceId: h.instanceId,
    name: h.name,
    address: h.address,
    port: h.port,
    deviceType: h.deviceType,
    canReachBack: h.canReachBack,
  }));
}

export default async function checkRunPodPods(): Promise<void> {
  const apiKey = await getRunPodApiKey();
  if (!apiKey) return;

  const pods = await prisma.runPodPod.findMany({
    where: {
      currentStatus: { notIn: ['terminated'] },
    },
  });

  for (const pod of pods) {
    try {
      const remote = await fetchPodStatus(apiKey, pod.runpodId);

      if (!remote) {
        // Pod not found or API error -- mark as error if it was running
        if (pod.currentStatus === 'running' || pod.currentStatus === 'deploying') {
          await prisma.runPodPod.update({
            where: { id: pod.id },
            data: {
              currentStatus: 'error',
              errorMessage: 'Pod not found on RunPod API',
              lastPolledAt: new Date(),
            },
          });
        }
        continue;
      }

      // Map RunPod desiredStatus to our currentStatus
      const desiredStatus = remote.desiredStatus?.toUpperCase() || '';
      let currentStatus = pod.currentStatus;

      if (desiredStatus === 'RUNNING' && remote.runtime) {
        currentStatus = 'running';
      } else if (desiredStatus === 'RUNNING' && !remote.runtime) {
        currentStatus = 'deploying';
      } else if (desiredStatus === 'EXITED') {
        currentStatus = 'stopped';
      } else if (desiredStatus === 'TERMINATED') {
        currentStatus = 'terminated';
      }

      // Extract public endpoint for port 8675
      let publicIp = pod.publicIp;
      let publicPort = pod.publicPort;
      if (remote.runtime?.ports) {
        const httpPort = remote.runtime.ports.find(p => p.privatePort === 8675 && p.isIpPublic);
        if (httpPort) {
          publicIp = httpPort.ip;
          publicPort = httpPort.publicPort;
        }
      }

      // Calculate uptime and estimated spend
      const uptimeSeconds = remote.runtime?.uptimeInSeconds || 0;
      const totalUptimeSeconds = uptimeSeconds > 0 ? uptimeSeconds : pod.totalUptimeSeconds;
      const estimatedSpend = (totalUptimeSeconds / 3600) * (remote.costPerHr || pod.costPerHr);

      await prisma.runPodPod.update({
        where: { id: pod.id },
        data: {
          currentStatus,
          desiredStatus: remote.desiredStatus || pod.desiredStatus,
          costPerHr: remote.costPerHr || pod.costPerHr,
          publicIp,
          publicPort,
          totalUptimeSeconds,
          estimatedSpend: Math.round(estimatedSpend * 100) / 100,
          lastPolledAt: new Date(),
          errorMessage: '',
          startedAt: currentStatus === 'running' && !pod.startedAt ? new Date() : pod.startedAt,
          terminatedAt: currentStatus === 'terminated' ? new Date() : pod.terminatedAt,
        },
      });

      // Auto-register as Host when the pod is running but no linked host exists
      if (currentStatus === 'running' && !pod.hostId) {
        const probeResult = await probeRunPodInstance(pod.runpodId, publicIp, publicPort, pod.authPassword);
        if (probeResult?.identity.instanceId) {
          const { identity, address: probeAddr, port: probePort } = probeResult;

          // Check if host already exists with this instanceId
          const existing = await prisma.host.findFirst({
            where: { instanceId: identity.instanceId },
          });

          if (existing) {
            // Link the existing host and update its address to whichever probe succeeded
            await prisma.runPodPod.update({
              where: { id: pod.id },
              data: { hostId: existing.id },
            });
            await prisma.host.update({
              where: { id: existing.id },
              data: {
                address: probeAddr,
                port: probePort,
                isOnline: true,
                lastSeen: new Date(),
                source: 'runpod',
                authToken: pod.authPassword,
              },
            });
          } else {
            // Create a new host and link it
            const host = await prisma.host.create({
              data: {
                name: pod.name,
                address: probeAddr,
                port: probePort,
                authToken: pod.authPassword,
                instanceId: identity.instanceId,
                source: 'runpod',
                isOnline: true,
                lastSeen: new Date(),
                deviceType: identity.deviceType || '',
                gpuSummary: identity.gpuSummary || '',
              },
            });
            await prisma.runPodPod.update({
              where: { id: pod.id },
              data: { hostId: host.id },
            });
          }
          console.log(`[RunPod] Auto-registered host for pod "${pod.name}" at ${probeAddr}:${probePort}`);

          // Bidirectional handshake: register the hub on the pod so it knows about us
          const podBaseUrl = buildHostBaseUrl(probeAddr, probePort);
          await registerHubOnPod(podBaseUrl, pod.authPassword);

          // Push our peer list so the pod learns about other hosts on our network
          const peers = await buildPeerList();
          if (peers.length > 0) {
            await gossipWithPod(podBaseUrl, pod.authPassword, peers);
          }
        }
      }

      // Update Host record if IP/port changed on pod resume
      if (currentStatus === 'running' && pod.hostId) {
        const existingHost = await prisma.host.findUnique({ where: { id: pod.hostId } });
        if (existingHost) {
          // Re-probe to find the best reachable address (direct IP or RunPod proxy)
          const probeResult = await probeRunPodInstance(pod.runpodId, publicIp, publicPort, pod.authPassword);
          if (probeResult) {
            const { identity, address: probeAddr, port: probePort } = probeResult;
            const addressChanged = existingHost.address !== probeAddr || existingHost.port !== probePort;
            if (addressChanged) {
              console.log(`[RunPod] Updated host address for pod "${pod.name}" to ${probeAddr}:${probePort}`);
            }

            // Always update lastSeen and isOnline on successful probe
            await prisma.host.update({
              where: { id: pod.hostId },
              data: {
                address: probeAddr,
                port: probePort,
                isOnline: true,
                isHidden: false,
                lastSeen: new Date(),
                deviceType: identity.deviceType || existingHost.deviceType,
                gpuSummary: identity.gpuSummary || existingHost.gpuSummary,
              },
            });

            // Push peer list to pod on each health check so it stays up-to-date
            const podBaseUrl = buildHostBaseUrl(probeAddr, probePort);
            const peers = await buildPeerList();
            if (peers.length > 0) {
              await gossipWithPod(podBaseUrl, pod.authPassword, peers);
            }
          }
        }
      }

      // If pod went offline externally, mark linked host as offline (and hidden if terminated)
      if ((currentStatus === 'stopped' || currentStatus === 'terminated') && pod.hostId) {
        await prisma.host.update({
          where: { id: pod.hostId },
          data: {
            isOnline: false,
            ...(currentStatus === 'terminated' && { isHidden: true }),
          },
        });
      }
    } catch (error) {
      console.error(`[RunPod] Error checking pod "${pod.name}" (${pod.runpodId}):`, error);
    }
  }
}
