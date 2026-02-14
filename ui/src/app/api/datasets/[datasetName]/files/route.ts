import { NextRequest } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join, extname, resolve } from 'path';
import { getDatasetsRoot } from '@/server/settings';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const CAPTION_EXTENSION = '.txt';

export async function GET(request: NextRequest, { params }: { params: Promise<{ datasetName: string }> }) {
  try {
    const { datasetName } = await params;
    const datasetsRoot = await getDatasetsRoot();
    if (!datasetsRoot) {
      return Response.json({ error: 'Datasets root not configured' }, { status: 500 });
    }

    const datasetDir = resolve(datasetsRoot, datasetName);

    // Security: ensure datasetDir is under datasetsRoot
    if (!datasetDir.startsWith(resolve(datasetsRoot))) {
      return Response.json({ error: 'Invalid dataset name' }, { status: 400 });
    }

    // If 'file' query param is present, serve that specific file
    const fileParam = request.nextUrl.searchParams.get('file');
    if (fileParam) {
      const filePath = resolve(datasetDir, fileParam);
      if (!filePath.startsWith(resolve(datasetDir))) {
        return Response.json({ error: 'Invalid path' }, { status: 400 });
      }
      const content = await readFile(filePath);
      return new Response(content);
    }

    // Otherwise list all files
    const files: string[] = [];
    const entries = await readdir(datasetDir, { withFileTypes: true, recursive: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext) || ext === CAPTION_EXTENSION) {
        const parentDir = entry.parentPath || entry.path || '';
        const relativePath = parentDir ? join(parentDir, entry.name).replace(datasetDir + '/', '') : entry.name;
        files.push(relativePath);
      }
    }

    return Response.json({ files });
  } catch {
    return Response.json({ error: 'Dataset not found' }, { status: 404 });
  }
}
