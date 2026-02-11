import { NextRequest } from 'next/server';
import { analyzeDataset } from '@/server/datasetAnalysis';

export async function POST(req: NextRequest) {
  try {
    const { datasetName, force } = await req.json();

    if (!datasetName || typeof datasetName !== 'string') {
      return new Response(JSON.stringify({ error: 'datasetName is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const result = await analyzeDataset(datasetName, {
            force: force ?? false,
            onProgress: progress => {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'progress',
                    current: progress.current,
                    total: progress.total,
                    imagePath: progress.imagePath,
                  }) + '\n',
                ),
              );
            },
          });

          controller.enqueue(encoder.encode(JSON.stringify({ type: 'complete', result }) + '\n'));
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
    console.error('Error starting dataset analysis:', error);
    return new Response(JSON.stringify({ error: 'Failed to start analysis' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
