import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AggregatedHost {
  id: string;
  name: string;
  isOnline: boolean;
  deviceType: string;
  gpus: any[];
  activeJobCount: number;
}

export async function GET() {
  try {
    const hosts = await prisma.host.findMany({
      where: { isHidden: false, isOnline: true },
    });

    const results = await Promise.allSettled(
      hosts.map(async (host): Promise<AggregatedHost> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const headers: Record<string, string> = {};
        if (host.authToken) {
          headers['Authorization'] = `Bearer ${host.authToken}`;
        }

        try {
          const [gpuRes, jobsRes] = await Promise.allSettled([
            fetch(`http://${host.address}:${host.port}/api/gpu`, {
              signal: controller.signal,
              headers,
            }),
            fetch(`http://${host.address}:${host.port}/api/jobs`, {
              signal: controller.signal,
              headers,
            }),
          ]);

          clearTimeout(timeout);

          let gpus: any[] = [];
          let activeJobCount = 0;

          if (gpuRes.status === 'fulfilled' && gpuRes.value.ok) {
            const gpuData = await gpuRes.value.json();
            gpus = gpuData.gpus || [];
          }

          if (jobsRes.status === 'fulfilled' && jobsRes.value.ok) {
            const jobsData = await jobsRes.value.json();
            const jobs = jobsData.jobs || [];
            activeJobCount = jobs.filter((j: any) => j.status === 'running' || j.status === 'queued').length;
          }

          return {
            id: host.id,
            name: host.name,
            isOnline: true,
            deviceType: host.deviceType,
            gpus,
            activeJobCount,
          };
        } catch {
          clearTimeout(timeout);
          throw new Error('unreachable');
        }
      }),
    );

    const aggregated: AggregatedHost[] = results.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      // Host was unreachable
      return {
        id: hosts[i].id,
        name: hosts[i].name,
        isOnline: false,
        deviceType: hosts[i].deviceType,
        gpus: [],
        activeJobCount: 0,
      };
    });

    return NextResponse.json({ hosts: aggregated });
  } catch (error) {
    console.error('Error aggregating host data:', error);
    return NextResponse.json({ error: 'Failed to aggregate host data' }, { status: 500 });
  }
}
