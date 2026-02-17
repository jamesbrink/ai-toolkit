import prisma from '../prisma';
import os from 'os';
import { buildHostBaseUrl } from '../../src/server/hostUrl';
import { detectDeviceType, getPrimaryLocalAddress } from '../../src/server/networkUtils';

const HEALTH_CHECK_TIMEOUT = 5000;
const FAILURE_THRESHOLD = 3;
const GOSSIP_STALE_MS = 5 * 60 * 1000; // 5 minutes

// Track consecutive failures per host (in-memory)
const failureCounts = new Map<string, number>();

interface GossipPeer {
  instanceId: string;
  name: string;
  address: string;
  port: number;
  deviceType?: string;
  canReachBack?: boolean;
}

interface HealthResponse {
  instanceId?: string;
  hostname?: string;
  deviceType?: string;
  gpuSummary?: string;
  peers?: GossipPeer[];
}

/**
 * Merge incoming gossip peers into our local DB.
 */
async function mergeGossipPeers(peers: GossipPeer[], ourInstanceId: string): Promise<void> {
  for (const peer of peers) {
    if (!peer.instanceId || !peer.address) continue;
    if (peer.instanceId === ourInstanceId) continue;

    try {
      const existing = await prisma.host.findUnique({ where: { instanceId: peer.instanceId } });
      if (existing) {
        const updateData: Record<string, unknown> = {
          lastGossipAt: new Date(),
          isOnline: true,
          lastSeen: new Date(),
        };
        // Only update address/name for gossip-sourced hosts
        if (existing.source === 'gossip') {
          updateData.gossipTtl = 3;
          updateData.address = peer.address;
          updateData.port = peer.port;
          if (peer.deviceType) updateData.deviceType = peer.deviceType;
          if (peer.name) updateData.name = peer.name;
        }
        await prisma.host.update({ where: { instanceId: peer.instanceId }, data: updateData });
      } else {
        // Check by address:port too
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
 * Clean up stale gossip-learned hosts.
 * Decrement TTL for gossip hosts whose lastGossipAt is older than GOSSIP_STALE_MS.
 * Delete hosts with TTL reaching 0.
 */
async function cleanupStaleGossipHosts(): Promise<void> {
  const staleThreshold = new Date(Date.now() - GOSSIP_STALE_MS);

  const staleHosts = await prisma.host.findMany({
    where: {
      source: 'gossip',
      lastGossipAt: { lt: staleThreshold },
      gossipTtl: { gt: 0 },
    },
  });

  for (const host of staleHosts) {
    const newTtl = host.gossipTtl - 1;
    if (newTtl <= 0) {
      await prisma.host.delete({ where: { id: host.id } });
      console.log(`[Gossip] Deleted stale gossip host "${host.name}" (${host.address}:${host.port})`);
    } else {
      await prisma.host.update({
        where: { id: host.id },
        data: { gossipTtl: newTtl, isOnline: false },
      });
    }
  }
}

export default async function checkHosts(): Promise<void> {
  console.log('[HealthCheck] Starting host check cycle...');
  // Get our instance ID for gossip
  const ourSetting = await prisma.settings.findUnique({ where: { key: 'INSTANCE_ID' } });
  const ourInstanceId = ourSetting?.value || '';

  // Check if gossip is enabled
  const gossipSetting = await prisma.settings.findUnique({ where: { key: 'GOSSIP_ENABLED' } });
  const gossipEnabled = !gossipSetting || gossipSetting.value !== 'false';

  // Build sender identity so the receiving host can register us
  const ourDeviceType = gossipEnabled ? await detectDeviceType() : undefined;
  const ourPort = parseInt(process.env.PORT || '8675', 10);
  const sender = gossipEnabled
    ? {
        instanceId: ourInstanceId,
        name: `AI Toolkit - ${os.hostname()}`,
        address: getPrimaryLocalAddress(),
        port: ourPort,
        deviceType: ourDeviceType,
      }
    : undefined;

  // Build peer list for gossip exchange (non-hidden, online hosts, no auth tokens)
  let peerList: GossipPeer[] = [];
  if (gossipEnabled) {
    const onlineHosts = await prisma.host.findMany({
      where: { isHidden: false, isOnline: true },
      select: { instanceId: true, name: true, address: true, port: true, deviceType: true, canReachBack: true },
    });
    peerList = onlineHosts.map(h => ({
      instanceId: h.instanceId,
      name: h.name,
      address: h.address,
      port: h.port,
      deviceType: h.deviceType,
      canReachBack: h.canReachBack,
    }));
  }

  const hosts = await prisma.host.findMany({
    where: { isHidden: false, source: { not: 'runpod' } },
  });
  console.log(`[HealthCheck] Checking ${hosts.length} host(s), sender: ${sender?.address || 'none'}`);

  for (const host of hosts) {
    // Skip health-checking hosts we can't reach back to
    if (!host.canReachBack) continue;

    const headers: Record<string, string> = {};
    if (host.authToken) {
      headers['Authorization'] = `Bearer ${host.authToken}`;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

      let data: HealthResponse;

      if (gossipEnabled) {
        // Try POST /api/hosts/health with gossip peer exchange
        headers['Content-Type'] = 'application/json';
        const healthUrl = `${buildHostBaseUrl(host.address, host.port)}/api/hosts/health`;
        const response = await fetch(healthUrl, {
          method: 'POST',
          signal: controller.signal,
          headers,
          body: JSON.stringify({ peers: peerList, sender }),
        });
        clearTimeout(timeout);

        if (response.status === 404 || response.status === 405) {
          // Old instance without /health endpoint — fallback to GET /identify
          const fallbackController = new AbortController();
          const fallbackTimeout = setTimeout(() => fallbackController.abort(), HEALTH_CHECK_TIMEOUT);
          delete headers['Content-Type'];
          const fallbackRes = await fetch(`${buildHostBaseUrl(host.address, host.port)}/api/hosts/identify`, {
            signal: fallbackController.signal,
            headers,
          });
          clearTimeout(fallbackTimeout);
          if (!fallbackRes.ok) throw new Error(`HTTP ${fallbackRes.status}`);
          data = await fallbackRes.json();
        } else if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        } else {
          data = await response.json();
        }
      } else {
        // Gossip disabled — use classic GET /identify
        const identifyUrl = `${buildHostBaseUrl(host.address, host.port)}/api/hosts/identify`;
        const response = await fetch(identifyUrl, { signal: controller.signal, headers });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.json();
      }

      failureCounts.set(host.id, 0);

      await prisma.host.update({
        where: { id: host.id },
        data: {
          isOnline: true,
          lastSeen: new Date(),
          deviceType: data.deviceType || host.deviceType,
          gpuSummary: data.gpuSummary || host.gpuSummary,
        },
      });

      // Merge gossip peers from response
      if (gossipEnabled && data.peers && data.peers.length > 0) {
        await mergeGossipPeers(data.peers, ourInstanceId);
      }
    } catch {
      const count = (failureCounts.get(host.id) || 0) + 1;
      failureCounts.set(host.id, count);

      if (count >= FAILURE_THRESHOLD && host.isOnline) {
        await prisma.host.update({
          where: { id: host.id },
          data: { isOnline: false },
        });
        console.log(
          `[HealthCheck] Host "${host.name}" (${host.address}:${host.port}) marked offline after ${count} failures`,
        );
      }
    }
  }

  // Clean up stale gossip hosts
  if (gossipEnabled) {
    await cleanupStaleGossipHosts();
  }
}
