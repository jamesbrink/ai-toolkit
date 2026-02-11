import { NextRequest } from 'next/server';
import path from 'path';
import { getDatasetsRoot } from '@/server/settings';
import { runPythonAnalysis } from '@/server/pythonAnalysis';
import fsSync from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function findImagesRecursively(dir: string): string[] {
  const results: string[] = [];
  if (!fsSync.existsSync(dir)) return results;
  const items = fsSync.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fsSync.statSync(itemPath);
    if (stat.isDirectory() && item !== '_controls' && !item.startsWith('.')) {
      results.push(...findImagesRecursively(itemPath));
    } else {
      const ext = path.extname(itemPath).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        results.push(itemPath);
      }
    }
  }
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const { datasetName, outputDatasetName, trainingResolution, padding } = await req.json();

    if (!datasetName || typeof datasetName !== 'string') {
      return new Response(JSON.stringify({ error: 'datasetName is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const datasetsRoot = await getDatasetsRoot();
    const datasetDir = path.join(datasetsRoot, datasetName);
    const outputName = outputDatasetName || `${datasetName}_faces`;
    const outputDir = path.join(datasetsRoot, outputName);
    const imagePaths = findImagesRecursively(datasetDir);

    if (imagePaths.length === 0) {
      return new Response(JSON.stringify({ error: 'No images found in dataset' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const summary = await runPythonAnalysis(
            'face-crop',
            imagePaths,
            {
              outputDir,
              trainingResolution: trainingResolution || 512,
              padding: padding || 1.8,
            },
            {
              onProgress: (current, total) => {
                controller.enqueue(encoder.encode(JSON.stringify({ type: 'progress', current, total }) + '\n'));
              },
              onResult: result => {
                controller.enqueue(encoder.encode(JSON.stringify(result) + '\n'));
              },
              onError: (error, filePath) => {
                controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error, filePath }) + '\n'));
              },
            },
          );

          controller.enqueue(encoder.encode(JSON.stringify(summary) + '\n'));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: message }) + '\n'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in face-crop:', error);
    return new Response(JSON.stringify({ error: 'Failed to start face cropping' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
