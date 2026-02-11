import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDatasetsRoot } from '@/server/settings';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

interface DatasetStats {
  imageCount: number;
  captionCount: number;
  totalSizeBytes: number;
  lastModified: number; // epoch ms
}

function scanDirectory(dir: string): DatasetStats {
  const stats: DatasetStats = { imageCount: 0, captionCount: 0, totalSizeBytes: 0, lastModified: 0 };
  if (!fs.existsSync(dir)) return stats;

  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    const itemPath = path.join(dir, item.name);

    if (item.isDirectory() && item.name !== '_controls') {
      const sub = scanDirectory(itemPath);
      stats.imageCount += sub.imageCount;
      stats.captionCount += sub.captionCount;
      stats.totalSizeBytes += sub.totalSizeBytes;
      if (sub.lastModified > stats.lastModified) stats.lastModified = sub.lastModified;
      continue;
    }

    const ext = path.extname(item.name).toLowerCase();
    try {
      const fileStat = fs.statSync(itemPath);
      stats.totalSizeBytes += fileStat.size;
      const mtime = fileStat.mtimeMs;
      if (mtime > stats.lastModified) stats.lastModified = mtime;

      if (IMAGE_EXTENSIONS.has(ext)) {
        stats.imageCount++;
        // Check for a matching caption .txt file
        const captionPath = itemPath.replace(new RegExp(`\\${ext}$`), '.txt');
        if (fs.existsSync(captionPath)) {
          stats.captionCount++;
        }
      }
    } catch {
      // Skip files we can't stat
    }
  }

  return stats;
}

export async function GET() {
  try {
    const datasetsPath = await getDatasetsRoot();

    if (!fs.existsSync(datasetsPath)) {
      fs.mkdirSync(datasetsPath);
    }

    const folders = fs
      .readdirSync(datasetsPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .filter(dirent => !dirent.name.startsWith('.'))
      .map(dirent => {
        const dirPath = path.join(datasetsPath, dirent.name);
        const stats = scanDirectory(dirPath);
        return {
          name: dirent.name,
          imageCount: stats.imageCount,
          captionCount: stats.captionCount,
          totalSizeBytes: stats.totalSizeBytes,
          lastModified: stats.lastModified || null,
        };
      });

    return NextResponse.json(folders);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch datasets' }, { status: 500 });
  }
}
