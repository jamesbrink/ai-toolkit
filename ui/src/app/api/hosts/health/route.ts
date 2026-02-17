import { NextResponse } from 'next/server';
import prisma from '@/server/prisma';
import { randomUUID } from 'crypto';
import os from 'os';
import { detectDeviceType } from '@/server/networkUtils';

interface GossipPeer {
  instanceId: string;
  name: string;
  address: string;
  port: number;
  deviceType?: string;
  canReachBack?: boolean;
}

/**
 * Merge incoming gossip peers into our local DB.
 * Skips self, upserts by instanceId, sets source='gossip' and gossipTtl=3.
 */
async function mergeGossipPeers(peers: GossipPeer[], ourInstanceId: string): Promise<void> {
  // Check if gossip is enabled
  const gossipSetting = await prisma.settings.findUnique({ where: { key: 'GOSSIP_ENABLED' } });
  if (gossipSetting && gossipSetting.value === 'false') return;

  for (const peer of peers) {
    if (!peer.instanceId || !peer.address) continue;
    if (peer.instanceId === ourInstanceId) continue;

    try {
      const existing = await prisma.host.findUnique({ where: { instanceId: peer.instanceId } });
      if (existing) {
        // Only update gossip fields if this host was gossip-learned (don't downgrade manually-added or peer hosts)
        const updateData: Record<string, unknown> = {
          lastGossipAt: new Date(),
          isOnline: true,
          lastSeen: new Date(),
        };

        if (existing.source === 'gossip') {
          updateData.gossipTtl = 3;
          updateData.address = peer.address;
          updateData.port = peer.port;
          if (peer.deviceType) updateData.deviceType = peer.deviceType;
          if (peer.name) updateData.name = peer.name;
        }

        await prisma.host.update({ where: { instanceId: peer.instanceId }, data: updateData });
      } else {
        // Also check by address:port
        const existingByAddr = await prisma.host.findFirst({
          where: { address: peer.address, port: peer.port },
        });
        if (existingByAddr) {
          await prisma.host.update({
            where: { id: existingByAddr.id },
            data: {
              instanceId: peer.instanceId,
              lastGossipAt: new Date(),
              isOnline: true,
              lastSeen: new Date(),
            },
          });
        } else {
          await prisma.host.create({
            data: {
              name: peer.name || peer.address,
              address: peer.address,
              port: peer.port,
              instanceId: peer.instanceId,
              deviceType: peer.deviceType || 'none',
              source: 'gossip',
              isOnline: true,
              gossipTtl: 3,
              lastSeen: new Date(),
              lastGossipAt: new Date(),
            },
          });
        }
      }
    } catch (error) {
      console.error(`[Gossip] Failed to merge peer ${peer.instanceId}:`, error);
    }
  }
}

/**
 * Build our peer list for gossip exchange.
 * Returns non-hidden, online hosts without authTokens.
 */
async function buildPeerList(): Promise<GossipPeer[]> {
  const hosts = await prisma.host.findMany({
    where: { isHidden: false, isOnline: true },
    select: {
      instanceId: true,
      name: true,
      address: true,
      port: true,
      deviceType: true,
      canReachBack: true,
    },
  });

  return hosts.map(h => ({
    instanceId: h.instanceId,
    name: h.name,
    address: h.address,
    port: h.port,
    deviceType: h.deviceType,
    canReachBack: h.canReachBack,
  }));
}

/**
 * GET /api/hosts/health — backward-compatible identity response (like /identify).
 */
export async function GET() {
  try {
    let setting = await prisma.settings.findUnique({ where: { key: 'INSTANCE_ID' } });
    if (!setting) {
      setting = await prisma.settings.create({ data: { key: 'INSTANCE_ID', value: randomUUID() } });
    }

    const deviceType = await detectDeviceType();
    const port = parseInt(process.env.PORT || '8675', 10);

    return NextResponse.json({
      instanceId: setting.value,
      hostname: os.hostname(),
      version: '1.0.0',
      deviceType,
      port,
    });
  } catch (error) {
    console.error('Error in GET /api/hosts/health:', error);
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 });
  }
}

/**
 * POST /api/hosts/health — health check with gossip exchange.
 * Accepts peer list, merges into DB, returns our identity + peer list.
 */
export async function POST(request: Request) {
  try {
    let setting = await prisma.settings.findUnique({ where: { key: 'INSTANCE_ID' } });
    if (!setting) {
      setting = await prisma.settings.create({ data: { key: 'INSTANCE_ID', value: randomUUID() } });
    }

    const deviceType = await detectDeviceType();
    const port = parseInt(process.env.PORT || '8675', 10);
    const ourInstanceId = setting.value;

    // Parse incoming peers and sender identity
    const body = await request.json();
    const incomingPeers: GossipPeer[] = body.peers || [];
    const sender = body.sender as GossipPeer | undefined;

    // Merge incoming peers into our DB
    if (incomingPeers.length > 0) {
      await mergeGossipPeers(incomingPeers, ourInstanceId);
    }

    // Register the caller (sender) so we discover them even if our mDNS/gossip is empty
    if (sender?.instanceId && sender?.address && sender.instanceId !== ourInstanceId) {
      try {
        const existingByAddr = await prisma.host.findFirst({
          where: { address: sender.address, port: sender.port },
        });

        if (existingByAddr) {
          await prisma.host.update({
            where: { id: existingByAddr.id },
            data: {
              instanceId: sender.instanceId,
              name: sender.name || existingByAddr.name,
              source: existingByAddr.source === 'mdns' ? 'mdns' : 'health-check',
              isOnline: true,
              lastSeen: new Date(),
              ...(sender.deviceType ? { deviceType: sender.deviceType } : {}),
            },
          });
        } else {
          const existingById = await prisma.host.findUnique({
            where: { instanceId: sender.instanceId },
          });

          if (existingById) {
            await prisma.host.update({
              where: { instanceId: sender.instanceId },
              data: {
                address: sender.address,
                port: sender.port,
                name: sender.name || existingById.name,
                isOnline: true,
                lastSeen: new Date(),
                ...(sender.deviceType ? { deviceType: sender.deviceType } : {}),
              },
            });
          } else {
            await prisma.host.create({
              data: {
                name: sender.name || sender.address,
                address: sender.address,
                port: sender.port,
                instanceId: sender.instanceId,
                deviceType: sender.deviceType || 'none',
                source: 'health-check',
                isOnline: true,
                lastSeen: new Date(),
              },
            });
            console.log(`[Health] Registered caller: ${sender.name || sender.address} at ${sender.address}:${sender.port}`);
          }
        }
      } catch (error) {
        console.error(`[Health] Failed to register sender ${sender.instanceId}:`, error);
      }
    }

    // Build our peer list for the response
    const ourPeers = await buildPeerList();

    return NextResponse.json({
      instanceId: ourInstanceId,
      hostname: os.hostname(),
      version: '1.0.0',
      deviceType,
      port,
      peers: ourPeers,
    });
  } catch (error) {
    console.error('Error in POST /api/hosts/health:', error);
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 });
  }
}
