import { NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { randomUUID } from 'crypto';

export async function GET() {
  try {
    const hosts = await prisma.host.findMany({
      where: { isHidden: false },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ hosts });
  } catch (error) {
    console.error('Error listing hosts:', error);
    return NextResponse.json({ error: 'Failed to list hosts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { address, port = 8675, name, authToken } = body;

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'address is required' }, { status: 400 });
    }

    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return NextResponse.json({ error: 'port must be an integer between 1 and 65535' }, { status: 400 });
    }

    // Try to fetch the remote's identity
    let remoteInstanceId: string | null = null;
    let remoteDeviceType = 'none';
    let remoteName = name || address;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(`http://${address}:${port}/api/hosts/identify`, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        remoteInstanceId = data.instanceId || null;
        remoteDeviceType = data.deviceType || 'none';
        if (!name && data.hostname) {
          remoteName = data.hostname;
        }
      }
    } catch {
      // Remote unreachable - continue with manual entry
    }

    const instanceId = remoteInstanceId || randomUUID();

    // Check if a host already exists at this address:port (prevents duplicates when
    // a remote instance restarts with a new instanceId)
    const existingByAddress = await prisma.host.findFirst({
      where: { address, port },
    });

    if (existingByAddress) {
      const updated = await prisma.host.update({
        where: { id: existingByAddress.id },
        data: {
          name: remoteName,
          instanceId,
          authToken: authToken || existingByAddress.authToken,
          deviceType: remoteDeviceType,
          isOnline: remoteInstanceId !== null,
          lastSeen: remoteInstanceId !== null ? new Date() : existingByAddress.lastSeen,
          source: 'manual',
        },
      });
      return NextResponse.json(updated);
    }

    // Also check by instanceId (same instance, different address — e.g. IP change)
    const existingByInstance = await prisma.host.findUnique({
      where: { instanceId },
    });

    if (existingByInstance) {
      const updated = await prisma.host.update({
        where: { instanceId },
        data: {
          address,
          port,
          name: remoteName,
          authToken: authToken || existingByInstance.authToken,
          deviceType: remoteDeviceType,
          isOnline: remoteInstanceId !== null,
          lastSeen: remoteInstanceId !== null ? new Date() : existingByInstance.lastSeen,
          source: 'manual',
        },
      });
      return NextResponse.json(updated);
    }

    // Create new host
    const host = await prisma.host.create({
      data: {
        name: remoteName,
        address,
        port,
        authToken: authToken || '',
        instanceId,
        source: 'manual',
        isOnline: remoteInstanceId !== null,
        deviceType: remoteDeviceType,
        lastSeen: new Date(),
      },
    });

    return NextResponse.json(host, { status: 201 });
  } catch (error) {
    console.error('Error creating host:', error);
    return NextResponse.json({ error: 'Failed to create host' }, { status: 500 });
  }
}
