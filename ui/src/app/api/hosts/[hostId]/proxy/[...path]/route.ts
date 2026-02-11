import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BLOCKED_PATTERNS = ['.env', 'node_modules', '.git', '__pycache__', '.pyc'];

type RouteContext = { params: Promise<{ hostId: string; path: string[] }> };

async function proxyRequest(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { hostId, path } = await context.params;
  const joinedPath = path.join('/');

  // Block sensitive paths
  for (const pattern of BLOCKED_PATTERNS) {
    if (joinedPath.includes(pattern)) {
      return NextResponse.json({ error: `Access to '${pattern}' is blocked` }, { status: 403 });
    }
  }

  const host = await prisma.host.findUnique({ where: { id: hostId } });
  if (!host) {
    return NextResponse.json({ error: 'Host not found' }, { status: 404 });
  }

  // Build the target URL, preserving query string
  const searchParams = request.nextUrl.searchParams.toString();
  const queryString = searchParams ? `?${searchParams}` : '';
  const targetUrl = `http://${host.address}:${host.port}/api/${joinedPath}${queryString}`;

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': request.headers.get('content-type') || 'application/json',
  };
  if (host.authToken) {
    headers['Authorization'] = `Bearer ${host.authToken}`;
  }

  // Forward request with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      signal: controller.signal,
    };

    // Include body for methods that support it
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        fetchOptions.body = await request.text();
      } catch {
        // No body to forward
      }
    }

    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeout);

    // Check if response is binary (images, etc.)
    const contentType = response.headers.get('content-type') || '';
    const isBinary =
      contentType.startsWith('image/') ||
      contentType.startsWith('audio/') ||
      contentType.startsWith('video/') ||
      contentType === 'application/octet-stream' ||
      contentType === 'application/zip';

    if (isBinary) {
      const buffer = await response.arrayBuffer();
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(buffer.byteLength),
        },
      });
    }

    // JSON or text response
    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Remote host request timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Remote host unreachable' }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}
