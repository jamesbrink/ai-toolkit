import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { getPod } from '@/server/runpod';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ podId: string }> }) {
  try {
    const { podId } = await params;
    const pod = await prisma.runPodPod.findUnique({ where: { id: podId } });
    if (!pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    const liveStatus = await getPod(pod.runpodId);
    return NextResponse.json({ live: liveStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch live pod data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
