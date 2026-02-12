import { NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { listMyPods } from '@/server/runpod';

export async function POST() {
  try {
    const remotePods = await listMyPods();
    const localPods = await prisma.runPodPod.findMany({
      where: { currentStatus: { not: 'terminated' } },
    });

    const remoteMap = new Map(remotePods.map((p) => [p.id, p]));
    let synced = 0;

    for (const local of localPods) {
      const remote = remoteMap.get(local.runpodId);
      if (!remote) {
        // Pod was terminated externally
        await prisma.runPodPod.update({
          where: { id: local.id },
          data: {
            currentStatus: 'terminated',
            terminatedAt: new Date(),
          },
        });
        if (local.hostId) {
          await prisma.host.update({
            where: { id: local.hostId },
            data: { isOnline: false },
          });
        }
        synced++;
      } else {
        // Update status from remote
        let status = local.currentStatus;
        if (remote.desiredStatus === 'EXITED' && local.currentStatus !== 'stopped') {
          status = 'stopped';
        } else if (remote.runtime && remote.desiredStatus === 'RUNNING' && local.currentStatus !== 'running') {
          status = 'running';
        }

        if (status !== local.currentStatus || remote.costPerHr !== local.costPerHr) {
          await prisma.runPodPod.update({
            where: { id: local.id },
            data: {
              currentStatus: status,
              costPerHr: remote.costPerHr,
              lastPolledAt: new Date(),
            },
          });
          synced++;
        }
      }
    }

    return NextResponse.json({ synced, totalRemote: remotePods.length, totalLocal: localPods.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync pods';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
