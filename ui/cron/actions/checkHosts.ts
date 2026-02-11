import prisma from '../prisma';

const HEALTH_CHECK_TIMEOUT = 5000;
const FAILURE_THRESHOLD = 3;

// Track consecutive failures per host (in-memory)
const failureCounts = new Map<string, number>();

export default async function checkHosts(): Promise<void> {
  const hosts = await prisma.host.findMany({
    where: { isHidden: false },
  });

  for (const host of hosts) {
    const url = `http://${host.address}:${host.port}/api/hosts/identify`;
    const headers: Record<string, string> = {};
    if (host.authToken) {
      headers['Authorization'] = `Bearer ${host.authToken}`;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

      const response = await fetch(url, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      failureCounts.set(host.id, 0);

      await prisma.host.update({
        where: { id: host.id },
        data: {
          isOnline: true,
          lastSeen: new Date(),
          deviceType: data.deviceType || host.deviceType,
          gpuSummary: data.gpuSummary || host.gpuSummary,
        },
      });
    } catch {
      const count = (failureCounts.get(host.id) || 0) + 1;
      failureCounts.set(host.id, count);

      if (count >= FAILURE_THRESHOLD && host.isOnline) {
        await prisma.host.update({
          where: { id: host.id },
          data: { isOnline: false },
        });
        console.log(
          `[HealthCheck] Host "${host.name}" (${host.address}:${host.port}) marked offline after ${count} failures`,
        );
      }
    }
  }
}
