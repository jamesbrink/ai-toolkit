import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/server/prisma';

export async function POST(request: NextRequest, { params }: { params: Promise<{ podId: string }> }) {
  try {
    const { podId } = await params;
    const pod = await prisma.runPodPod.findUnique({ where: { id: podId } });
    if (!pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }
    if (!pod.hostId) {
      return NextResponse.json({ error: 'Pod has no linked host yet' }, { status: 400 });
    }

    const host = await prisma.host.findUnique({ where: { id: pod.hostId } });
    if (!host) {
      return NextResponse.json({ error: 'Linked host not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const remotePath = (body as { remotePath?: string }).remotePath || '/workspace/output';

    // Proxy the request to the remote host's export endpoint
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (host.authToken) {
      headers['Authorization'] = `Bearer ${host.authToken}`;
    }

    const remoteRes = await fetch(`http://${host.address}:${host.port}/api/datasets/export`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: remotePath }),
      signal: AbortSignal.timeout(300000), // 5 min timeout for large downloads
    });

    if (!remoteRes.ok) {
      const errText = await remoteRes.text();
      return NextResponse.json({ error: `Remote download failed: ${errText}` }, { status: remoteRes.status });
    }

    // Stream the response back
    return new NextResponse(remoteRes.body, {
      status: 200,
      headers: {
        'Content-Type': remoteRes.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Disposition': remoteRes.headers.get('Content-Disposition') || 'attachment',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to download from pod';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
