import prisma from '../prisma';

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

async function probeInstance(
  ip: string,
  port: number,
  authToken: string,
): Promise<{ instanceId: string; deviceType?: string; gpuSummary?: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT);

    const response = await fetch(`http://${ip}:${port}/api/hosts/identify`, {
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

      // Auto-register as Host if we have a public endpoint but no linked host
      if (currentStatus === 'running' && publicIp && publicPort && !pod.hostId) {
        const identity = await probeInstance(publicIp, publicPort, pod.authPassword);
        if (identity?.instanceId) {
          // Check if host already exists with this instanceId
          const existing = await prisma.host.findFirst({
            where: { instanceId: identity.instanceId },
          });

          if (existing) {
            // Link the existing host
            await prisma.runPodPod.update({
              where: { id: pod.id },
              data: { hostId: existing.id },
            });
            await prisma.host.update({
              where: { id: existing.id },
              data: {
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
                address: publicIp,
                port: publicPort,
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
          console.log(`[RunPod] Auto-registered host for pod "${pod.name}" at ${publicIp}:${publicPort}`);
        }
      }

      // If pod went offline externally, mark linked host as offline
      if ((currentStatus === 'stopped' || currentStatus === 'terminated') && pod.hostId) {
        await prisma.host.update({
          where: { id: pod.hostId },
          data: { isOnline: false },
        });
      }
    } catch (error) {
      console.error(`[RunPod] Error checking pod "${pod.name}" (${pod.runpodId}):`, error);
    }
  }
}
