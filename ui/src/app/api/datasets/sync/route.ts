import { NextRequest } from 'next/server';
import { join, dirname } from 'path';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { getDatasetsRoot } from '@/server/settings';
import prisma from '@/server/prisma';
import { buildHostBaseUrl } from '@/server/hostUrl';
import type { SyncAction } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { datasetName, hostId, actions } = (await request.json()) as {
      datasetName: string;
      hostId: string;
      actions: SyncAction[];
    };

    if (!datasetName || !hostId || !actions?.length) {
      return new Response(JSON.stringify({ error: 'datasetName, hostId, and actions are required' }), {
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

    const datasetDir = join(datasetsRoot, datasetName);
    const remoteBaseUrl = buildHostBaseUrl(host.address, host.port);
    const authHeaders: Record<string, string> = {};
    if (host.authToken) {
      authHeaders['Authorization'] = `Bearer ${host.authToken}`;
    }

    // Filter to actionable items
    const actionable = actions.filter(a => a.action !== 'skip');
    if (actionable.length === 0) {
      return new Response(JSON.stringify({ error: 'No actionable sync operations' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Stream NDJSON progress
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        };

        let completed = 0;
        const total = actionable.length;
        const errors: string[] = [];

        try {
          for (const action of actionable) {
            send({ type: 'progress', completed, total, currentFile: action.path, action: action.action });

            try {
              if (action.action === 'pull') {
                // Fetch file from remote
                const fileRes = await fetch(
                  `${remoteBaseUrl}/api/datasets/${encodeURIComponent(datasetName)}/files?file=${encodeURIComponent(action.path)}`,
                  { headers: authHeaders },
                );

                if (!fileRes.ok) {
                  errors.push(`Failed to pull ${action.path}`);
                  completed++;
                  continue;
                }

                const buffer = Buffer.from(await fileRes.arrayBuffer());
                const localPath = join(datasetDir, action.path);
                await mkdir(dirname(localPath), { recursive: true });
                await writeFile(localPath, buffer);
              } else if (action.action === 'push') {
                // Upload file to remote
                const filePath = join(datasetDir, action.path);
                const fileBuffer = await readFile(filePath);
                const formData = new FormData();
                formData.append('datasetName', datasetName);
                formData.append('files', new Blob([fileBuffer]), action.path);

                const uploadRes = await fetch(`${remoteBaseUrl}/api/datasets/upload`, {
                  method: 'POST',
                  headers: authHeaders,
                  body: formData,
                });

                if (!uploadRes.ok) {
                  errors.push(`Failed to push ${action.path}`);
                  completed++;
                  continue;
                }
              } else if (action.action === 'ai_merge') {
                // AI merge is handled via the merge-caption endpoint
                // Here we just write the pre-merged result if provided
                if (action.localCaption != null) {
                  const localPath = join(datasetDir, action.path);
                  await mkdir(dirname(localPath), { recursive: true });
                  await writeFile(localPath, action.localCaption, 'utf-8');
                }
              }
            } catch (err) {
              errors.push(`Error on ${action.path}: ${err instanceof Error ? err.message : String(err)}`);
            }

            completed++;
          }

          send({ type: 'complete', completed, errors });
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
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
