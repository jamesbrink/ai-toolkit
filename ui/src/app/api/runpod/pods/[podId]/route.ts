import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { terminatePod } from '@/server/runpod';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ podId: string }> },
) {
  try {
    const { podId } = await params;
    const pod = await prisma.runPodPod.findUnique({ where: { id: podId } });
    if (!pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }
    return NextResponse.json({ pod });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch pod';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ podId: string }> },
) {
  try {
    const { podId } = await params;
    const body = await request.json();
    const { name } = body;
    const pod = await prisma.runPodPod.update({
      where: { id: podId },
      data: { ...(name !== undefined && { name }) },
    });
    return NextResponse.json({ pod });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update pod';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ podId: string }> },
) {
  try {
    const { podId } = await params;
    const pod = await prisma.runPodPod.findUnique({ where: { id: podId } });
    if (!pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    if (pod.currentStatus !== 'terminated') {
      await terminatePod(pod.runpodId);
    }

    await prisma.runPodPod.update({
      where: { id: podId },
      data: {
        currentStatus: 'terminated',
        terminatedAt: new Date(),
      },
    });

    if (pod.hostId) {
      await prisma.host.update({
        where: { id: pod.hostId },
        data: { isOnline: false },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete pod';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
