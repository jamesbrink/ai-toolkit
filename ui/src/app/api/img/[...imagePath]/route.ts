import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDatasetsRoot, getTrainingFolder, getDataRoot } from '@/server/settings';
import { contentTypeMap } from '@/utils/mimeTypes';

export async function GET(request: NextRequest, { params }: { params: Promise<{ imagePath: string[] }> }) {
  const { imagePath } = await params;
  try {
    // Reconstruct the absolute file path from catch-all segments.
    // Local direct access: single segment with URL-encoded slashes (e.g. ["%2Fhome%2F..."])
    // Proxy relay: multiple segments where %2F was decoded by the HTTP layer (e.g. ["home","user","..."])
    const segments = Array.isArray(imagePath) ? imagePath : [String(imagePath)];
    let filepath: string;
    if (segments.length === 1) {
      filepath = decodeURIComponent(segments[0]);
    } else {
      filepath = '/' + segments.map(s => decodeURIComponent(s)).join('/');
    }

    // Get allowed directories
    const datasetRoot = await getDatasetsRoot();
    const trainingRoot = await getTrainingFolder();
    const dataRoot = await getDataRoot();

    const allowedDirs = [datasetRoot, trainingRoot, dataRoot];

    // Security check: Ensure path is in allowed directory
    const isAllowed = allowedDirs.some(allowedDir => filepath.startsWith(allowedDir)) && !filepath.includes('..');

    if (!isAllowed) {
      console.warn(`Access denied: ${filepath} not in ${allowedDirs.join(', ')}`);
      return new NextResponse('Access denied', { status: 403 });
    }

    // Symlink protection: verify resolved path is still within allowed directories
    try {
      const realPath = fs.realpathSync(filepath);
      if (!allowedDirs.some(root => realPath.startsWith(root))) {
        console.warn(`Access denied (symlink escape): ${filepath} resolves to ${realPath}`);
        return new NextResponse('Access denied', { status: 403 });
      }
    } catch {
      // realpathSync throws if file doesn't exist — handled by existsSync below
    }

    // Check if file exists
    if (!fs.existsSync(filepath)) {
      console.warn(`File not found: ${filepath}`);
      return new NextResponse('File not found', { status: 404 });
    }

    // Get file info
    const stat = fs.statSync(filepath);
    if (!stat.isFile()) {
      return new NextResponse('Not a file', { status: 400 });
    }

    // Determine content type
    const ext = path.extname(filepath).toLowerCase();
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // Read file as buffer
    const fileBuffer = fs.readFileSync(filepath);

    // Return file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Error serving image:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
