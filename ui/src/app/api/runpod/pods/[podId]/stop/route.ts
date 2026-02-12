import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { stopPod } from '@/server/runpod';

export async function POST(
  _request: NextRequest,
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

    await stopPod(pod.runpodId);
    const updated = await prisma.runPodPod.update({
      where: { id: podId },
      data: { desiredStatus: 'EXITED', currentStatus: 'stopped' },
    });

    return NextResponse.json({ pod: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to stop pod';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
