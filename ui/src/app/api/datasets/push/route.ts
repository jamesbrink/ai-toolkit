import { NextRequest } from 'next/server';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { getDatasetsRoot } from '@/server/settings';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const CAPTION_EXTENSION = '.txt';

async function listDatasetFiles(datasetDir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(datasetDir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext) || ext === CAPTION_EXTENSION) {
      // Build relative path from dataset root
      const parentDir = entry.parentPath || entry.path || '';
      const relativePath = parentDir
        ? join(parentDir, entry.name).replace(datasetDir + '/', '')
        : entry.name;
      files.push(relativePath);
    }
  }
  return files;
}

export async function POST(request: NextRequest) {
  try {
    const { datasetName, hostId } = await request.json();

    if (!datasetName || !hostId) {
      return new Response(JSON.stringify({ error: 'datasetName and hostId are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Look up host
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

    // Verify dataset exists locally
    try {
      const s = await stat(datasetDir);
      if (!s.isDirectory()) throw new Error('Not a directory');
    } catch {
      return new Response(JSON.stringify({ error: `Dataset "${datasetName}" not found locally` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const files = await listDatasetFiles(datasetDir);
    if (files.length === 0) {
      return new Response(JSON.stringify({ error: 'Dataset is empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const remoteBaseUrl = `http://${host.address}:${host.port}`;
    const authHeaders: Record<string, string> = {};
    if (host.authToken) {
      authHeaders['Authorization'] = `Bearer ${host.authToken}`;
    }

    // Stream NDJSON progress
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        };

        try {
          // Create the dataset on the remote host first
          try {
            await fetch(`${remoteBaseUrl}/api/datasets/create`, {
              method: 'POST',
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: datasetName }),
            });
          } catch {
            // Dataset may already exist — that's fine
          }

          const BATCH_SIZE = 5;
          let transferred = 0;
          const total = files.length;

          for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);
            const formData = new FormData();
            formData.append('datasetName', datasetName);

            for (const relativePath of batch) {
              const filePath = join(datasetDir, relativePath);
              const fileBuffer = await readFile(filePath);
              const blob = new Blob([fileBuffer]);
              formData.append('files', blob, relativePath);
            }

            send({
              type: 'progress',
              transferred,
              total,
              currentFile: batch[0],
            });

            const uploadRes = await fetch(`${remoteBaseUrl}/api/datasets/upload`, {
              method: 'POST',
              headers: authHeaders,
              body: formData,
            });

            if (!uploadRes.ok) {
              const errText = await uploadRes.text().catch(() => 'Unknown error');
              send({ type: 'error', error: `Upload batch failed: ${errText}` });
              controller.close();
              return;
            }

            transferred += batch.length;
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
    console.error('Push error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
