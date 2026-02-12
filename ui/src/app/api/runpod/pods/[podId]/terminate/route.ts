import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { terminatePod } from '@/server/runpod';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ podId: string }> },
) {
  try {
    const { podId } = await params;
    const pod = await prisma.runPodPod.findUnique({ where: { id: podId } });
    if (!pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }
    if (pod.currentStatus === 'terminated') {
      return NextResponse.json({ error: 'Pod is already terminated' }, { status: 400 });
    }

    // Check for active jobs on linked host
    const body = await request.json().catch(() => ({}));
    if (pod.hostId && !(body as { confirmTerminate?: boolean }).confirmTerminate) {
      try {
        const host = await prisma.host.findUnique({ where: { id: pod.hostId } });
        if (host?.isOnline) {
          const jobsRes = await fetch(`http://${host.address}:${host.port}/api/jobs`, {
            headers: host.authToken ? { Authorization: `Bearer ${host.authToken}` } : {},
            signal: AbortSignal.timeout(5000),
          });
          if (jobsRes.ok) {
            const jobsData = await jobsRes.json();
            const activeJobs = (jobsData.jobs || []).filter(
              (j: { status: string }) => j.status === 'running' || j.status === 'queued',
            );
            if (activeJobs.length > 0) {
              return NextResponse.json(
                {
                  warning: true,
                  activeJobCount: activeJobs.length,
                  estimatedSpend: pod.estimatedSpend,
                  message: `Pod has ${activeJobs.length} active job(s). Set confirmTerminate: true to proceed.`,
                },
                { status: 409 },
              );
            }
          }
        }
      } catch {
        // If we can't check for jobs, proceed with termination
      }
    }

    await terminatePod(pod.runpodId);

    const updated = await prisma.runPodPod.update({
      where: { id: podId },
      data: {
        currentStatus: 'terminated',
        desiredStatus: 'EXITED',
        terminatedAt: new Date(),
      },
    });

    // Mark linked host offline
    if (pod.hostId) {
      await prisma.host.update({
        where: { id: pod.hostId },
        data: { isOnline: false },
      });
    }

    return NextResponse.json({
      pod: updated,
      totalSpend: updated.estimatedSpend,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to terminate pod';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
