import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { stat } from 'fs/promises';
import { getDatasetsRoot } from '@/server/settings';
import { generateManifest, diffManifests } from '@/server/datasetManifest';
import prisma from '@/server/prisma';
import { buildHostBaseUrl } from '@/server/hostUrl';
import type { DatasetManifest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { datasetName, hostId, rich } = await request.json();

    if (!datasetName || !hostId) {
      return NextResponse.json({ error: 'datasetName and hostId are required' }, { status: 400 });
    }

    // Look up host
    const host = await prisma.host.findUnique({ where: { id: hostId } });
    if (!host) {
      return NextResponse.json({ error: 'Host not found' }, { status: 404 });
    }

    // Generate local manifest
    const datasetsRoot = await getDatasetsRoot();
    if (!datasetsRoot) {
      return NextResponse.json({ error: 'Datasets root not configured' }, { status: 500 });
    }

    const datasetDir = join(datasetsRoot, datasetName);
    try {
      const s = await stat(datasetDir);
      if (!s.isDirectory()) throw new Error('Not a directory');
    } catch {
      return NextResponse.json({ error: `Dataset "${datasetName}" not found locally` }, { status: 404 });
    }

    const localManifest = await generateManifest(datasetDir, { rich: rich ?? false, datasetName });

    // Fetch remote manifest via proxy
    const remoteBaseUrl = buildHostBaseUrl(host.address, host.port);
    const authHeaders: Record<string, string> = {};
    if (host.authToken) {
      authHeaders['Authorization'] = `Bearer ${host.authToken}`;
    }

    const richParam = rich ? '?rich=true' : '';
    const remoteRes = await fetch(
      `${remoteBaseUrl}/api/datasets/${encodeURIComponent(datasetName)}/manifest${richParam}`,
      { headers: authHeaders },
    );

    if (!remoteRes.ok) {
      const contentType = remoteRes.headers.get('content-type') || '';
      let errorMessage: string;

      if (remoteRes.status === 404) {
        // Remote host likely doesn't have the manifest endpoint yet
        errorMessage =
          'Remote host does not support dataset comparison. It may need to be updated to the latest version.';
      } else if (contentType.includes('application/json')) {
        const errJson = await remoteRes.json().catch(() => null);
        errorMessage = errJson?.error || `Remote host returned status ${remoteRes.status}`;
      } else {
        errorMessage = `Remote host returned status ${remoteRes.status}`;
      }

      return NextResponse.json({ error: errorMessage }, { status: remoteRes.status === 404 ? 404 : 502 });
    }

    const remoteManifest = (await remoteRes.json()) as DatasetManifest;

    // Diff
    const diff = diffManifests(localManifest, remoteManifest);
    return NextResponse.json(diff);
  } catch (error) {
    console.error('Compare error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
