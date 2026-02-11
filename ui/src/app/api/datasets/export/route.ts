import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { getDatasetsRoot } from '@/server/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function findImagesRecursively(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
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
    const { datasetName, includeCaptions } = await req.json();

    if (!datasetName || typeof datasetName !== 'string') {
      return NextResponse.json({ error: 'datasetName is required' }, { status: 400 });
    }

    const datasetsRoot = await getDatasetsRoot();
    const datasetDir = path.join(datasetsRoot, datasetName);

    if (!fs.existsSync(datasetDir)) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    const imagePaths = findImagesRecursively(datasetDir);
    if (imagePaths.length === 0) {
      return NextResponse.json({ error: 'No images found in dataset' }, { status: 400 });
    }

    // Create ZIP in the dataset directory
    const outputPath = path.join(datasetsRoot, `${datasetName}.zip`);

    // Remove existing ZIP if present
    if (fs.existsSync(outputPath)) {
      await fsp.unlink(outputPath);
    }

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', () => resolve());
      output.on('error', reject);
      archive.on('error', reject);

      archive.pipe(output);

      for (const imgPath of imagePaths) {
        // Preserve relative path within dataset
        const relativePath = path.relative(datasetDir, imgPath);
        archive.file(imgPath, { name: path.join(datasetName, relativePath) });

        // Include caption .txt files if requested
        if (includeCaptions !== false) {
          const ext = path.extname(imgPath);
          const captionPath = imgPath.replace(ext, '.txt');
          if (fs.existsSync(captionPath)) {
            const captionRelative = path.relative(datasetDir, captionPath);
            archive.file(captionPath, { name: path.join(datasetName, captionRelative) });
          }
        }
      }

      archive.finalize().catch(reject);
    });

    return NextResponse.json({
      ok: true,
      zipPath: outputPath,
      fileName: `${datasetName}.zip`,
    });
  } catch (err) {
    console.error('Export error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 },
    );
  }
}
