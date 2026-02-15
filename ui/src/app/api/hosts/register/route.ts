import { NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { buildHostBaseUrl } from '@/server/hostUrl';

// Rate limiting: 10 registrations per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  try {
    // Rate limit by IP
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Auth check: if AI_TOOLKIT_AUTH is set, require Bearer token
    const requiredAuth = process.env.AI_TOOLKIT_AUTH;
    if (requiredAuth) {
      const authHeader = request.headers.get('authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token !== requiredAuth) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { instanceId, name, hostname, address, port = 8675, deviceType, authToken } = body;

    if (!instanceId || !address) {
      return NextResponse.json({ error: 'instanceId and address are required' }, { status: 400 });
    }

    // Self-check: reject if this is our own instance
    const ourSetting = await prisma.settings.findUnique({ where: { key: 'INSTANCE_ID' } });
    if (ourSetting && ourSetting.value === instanceId) {
      return NextResponse.json({ error: 'Cannot register self' }, { status: 409 });
    }

    // Connectivity test: can we reach back to the caller?
    let canReachBack = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(`${buildHostBaseUrl(address, port)}/api/hosts/identify`, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);
      canReachBack = res.ok;
    } catch {
      // Can't reach back — NAT/firewall
    }

    const displayName = name || hostname || address;
    const portNum = Number(port);

    // Upsert by instanceId
    const existing = await prisma.host.findUnique({ where: { instanceId } });
    if (existing) {
      await prisma.host.update({
        where: { instanceId },
        data: {
          name: displayName,
          address,
          port: portNum,
          deviceType: deviceType || existing.deviceType,
          authToken: authToken || existing.authToken,
          canReachBack,
          source: existing.source === 'mdns' ? 'mdns' : 'peer',
          isOnline: true,
          lastSeen: new Date(),
          lastGossipAt: new Date(),
        },
      });
    } else {
      // Also check by address:port to avoid duplicates
      const existingByAddr = await prisma.host.findFirst({ where: { address, port: portNum } });
      if (existingByAddr) {
        await prisma.host.update({
          where: { id: existingByAddr.id },
          data: {
            name: displayName,
            instanceId,
            deviceType: deviceType || existingByAddr.deviceType,
            authToken: authToken || existingByAddr.authToken,
            canReachBack,
            source: existingByAddr.source === 'mdns' ? 'mdns' : 'peer',
            isOnline: true,
            lastSeen: new Date(),
            lastGossipAt: new Date(),
          },
        });
      } else {
        await prisma.host.create({
          data: {
            name: displayName,
            address,
            port: portNum,
            instanceId,
            deviceType: deviceType || 'none',
            authToken: authToken || '',
            canReachBack,
            source: 'peer',
            isOnline: true,
            lastSeen: new Date(),
            lastGossipAt: new Date(),
          },
        });
      }
    }

    return NextResponse.json({ success: true, canReachBack });
  } catch (error) {
    console.error('Error in /api/hosts/register:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
