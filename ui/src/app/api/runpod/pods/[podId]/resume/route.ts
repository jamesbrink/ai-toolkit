import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { resumePod } from '@/server/runpod';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ podId: string }> }) {
  try {
    const { podId } = await params;
    const pod = await prisma.runPodPod.findUnique({ where: { id: podId } });
    if (!pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }
    if (pod.currentStatus !== 'stopped') {
      return NextResponse.json({ error: 'Pod is not stopped' }, { status: 400 });
    }

    await resumePod(pod.runpodId);
    const updated = await prisma.runPodPod.update({
      where: { id: podId },
      data: { desiredStatus: 'RUNNING', currentStatus: 'deploying' },
    });

    return NextResponse.json({ pod: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resume pod';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
