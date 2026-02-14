import { NextRequest } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { getDatasetsRoot } from '@/server/settings';
import prisma from '@/server/prisma';
import { buildHostBaseUrl } from '@/server/hostUrl';

export async function POST(request: NextRequest) {
  try {
    const { datasetName, hostId, localName } = await request.json();

    if (!datasetName || !hostId) {
      return new Response(JSON.stringify({ error: 'datasetName and hostId are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const host = await prisma.host.findUnique({ where: { id: hostId } });
    if (!host) {
      return new Response(JSON.stringify({ error: 'Host not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const datasetsRoot = await getDatasetsRoot();
    if (!datasetsRoot) {
      return new Response(JSON.stringify({ error: 'Datasets root not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const targetName = localName || datasetName;
    const targetDir = join(datasetsRoot, targetName);

    const remoteBaseUrl = buildHostBaseUrl(host.address, host.port);
    const authHeaders: Record<string, string> = {};
    if (host.authToken) {
      authHeaders['Authorization'] = `Bearer ${host.authToken}`;
    }

    // Fetch file list from remote
    const listRes = await fetch(`${remoteBaseUrl}/api/datasets/${encodeURIComponent(datasetName)}/files`, {
      headers: authHeaders,
    });
    if (!listRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to list remote dataset files' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const { files } = (await listRes.json()) as { files: string[] };

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ error: 'Remote dataset is empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create local directory
    await mkdir(targetDir, { recursive: true });

    // Stream NDJSON progress
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        };

        try {
          let transferred = 0;
          const total = files.length;

          for (const file of files) {
            send({ type: 'progress', transferred, total, currentFile: file });

            // Fetch individual file from remote via the files endpoint
            const fileRes = await fetch(
              `${remoteBaseUrl}/api/datasets/${encodeURIComponent(datasetName)}/files?file=${encodeURIComponent(file)}`,
              { headers: authHeaders },
            );

            if (!fileRes.ok) {
              send({ type: 'error', error: `Failed to fetch file: ${file}` });
              controller.close();
              return;
            }

            const buffer = Buffer.from(await fileRes.arrayBuffer());
            const localPath = join(targetDir, file);
            await mkdir(dirname(localPath), { recursive: true });
            await writeFile(localPath, buffer);

            transferred++;
          }

          send({ type: 'complete', transferred });
        } catch (err) {
          send({ type: 'error', error: err instanceof Error ? err.message : String(err) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Pull error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
