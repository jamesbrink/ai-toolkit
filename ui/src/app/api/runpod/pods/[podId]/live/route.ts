import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { getPod } from '@/server/runpod';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ podId: string }> }) {
  const { podId } = await params;
  const pod = await prisma.runPodPod.findUnique({ where: { id: podId } });
  if (!pod) {
    return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
  }

  try {
    const liveStatus = await getPod(pod.runpodId);
    return NextResponse.json({ live: liveStatus });
  } catch {
    // RunPod API may fail for terminated/stopped pods — return null instead of 500
    return NextResponse.json({ live: null });
  }
}
