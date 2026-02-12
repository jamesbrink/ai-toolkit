import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { getDatasetsRoot, getTrainingFolder } from '@/server/settings';
import { contentTypeMap } from '@/utils/mimeTypes';

export async function GET(request: NextRequest, { params }: { params: Promise<{ filePath: string[] }> }) {
  const { filePath } = await params;
  try {
    // Decode the path (filePath is a string[] from catch-all route segment)
    const decodedFilePath = decodeURIComponent(filePath.join('/'));

    // Get allowed directories
    const datasetRoot = await getDatasetsRoot();
    const trainingRoot = await getTrainingFolder();
    const allowedDirs = [datasetRoot, trainingRoot];

    // Security check: Ensure path is in allowed directory
    const isAllowed =
      allowedDirs.some(allowedDir => decodedFilePath.startsWith(allowedDir)) && !decodedFilePath.includes('..');

    if (!isAllowed) {
      console.warn(`Access denied: ${decodedFilePath} not in ${allowedDirs.join(', ')}`);
      return new NextResponse('Access denied', { status: 403 });
    }

    // Symlink protection: verify resolved path is still within allowed directories
    try {
      const realPath = fs.realpathSync(decodedFilePath);
      if (!allowedDirs.some(root => realPath.startsWith(root))) {
        console.warn(`Access denied (symlink escape): ${decodedFilePath} resolves to ${realPath}`);
        return new NextResponse('Access denied', { status: 403 });
      }
    } catch {
      // realpathSync throws if file doesn't exist — handled by existsSync below
    }

    // Check if file exists
    if (!fs.existsSync(decodedFilePath)) {
      console.warn(`File not found: ${decodedFilePath}`);
      return new NextResponse('File not found', { status: 404 });
    }

    // Get file info
    const stat = fs.statSync(decodedFilePath);
    if (!stat.isFile()) {
      return new NextResponse('Not a file', { status: 400 });
    }

    // Get filename for Content-Disposition
    const filename = path.basename(decodedFilePath);

    // Determine content type
    const ext = path.extname(decodedFilePath).toLowerCase();
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // Get range header for partial content support
    const range = request.headers.get('range');

    // Common headers for better download handling
    const commonHeaders = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'X-Content-Type-Options': 'nosniff',
    };

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 10 * 1024 * 1024, stat.size - 1); // 10MB chunks

      if (isNaN(start) || (parts[1] && isNaN(end))) {
        return new NextResponse('Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` },
        });
      }

      const chunkSize = end - start + 1;

      const fileStream = fs.createReadStream(decodedFilePath, {
        start,
        end,
        highWaterMark: 64 * 1024, // 64KB buffer
      });

      return new NextResponse(Readable.toWeb(fileStream) as ReadableStream, {
        status: 206,
        headers: {
          ...commonHeaders,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': String(chunkSize),
        },
      });
    } else {
      // For full file download, read directly without streaming wrapper
      const fileStream = fs.createReadStream(decodedFilePath, {
        highWaterMark: 64 * 1024, // 64KB buffer
      });

      return new NextResponse(Readable.toWeb(fileStream) as ReadableStream, {
        headers: {
          ...commonHeaders,
          'Content-Length': String(stat.size),
        },
      });
    }
  } catch (error) {
    console.error('Error serving file:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
