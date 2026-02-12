import Bonjour from 'bonjour-service';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import prisma from './prisma';

const SERVICE_TYPE = 'ai-toolkit';
const PORT = parseInt(process.env.PORT || '8675', 10);
const VERSION = '0.1.0';

let bonjour: InstanceType<typeof Bonjour> | null = null;
let browser: ReturnType<InstanceType<typeof Bonjour>['find']> | null = null;
let instanceId: string = '';

// Debounce concurrent mDNS events for the same address:port
const pendingUpserts = new Set<string>();

async function getOrCreateInstanceId(): Promise<string> {
  const existing = await prisma.settings.findUnique({
    where: { key: 'INSTANCE_ID' },
  });
  if (existing) {
    return existing.value;
  }
  const id = uuidv4();
  await prisma.settings.upsert({
    where: { key: 'INSTANCE_ID' },
    update: { value: id },
    create: { key: 'INSTANCE_ID', value: id },
  });
  return id;
}

async function isMdnsEnabled(): Promise<boolean> {
  if (process.env.AI_TOOLKIT_MDNS === 'false') {
    return false;
  }
  const setting = await prisma.settings.findUnique({
    where: { key: 'MDNS_ENABLED' },
  });
  if (setting && setting.value === 'false') {
    return false;
  }
  return true;
}

async function handleServiceUp(service: {
  name: string;
  host: string;
  port: number;
  txt?: Record<string, string>;
  addresses?: string[];
}) {
  const txt = service.txt || {};
  const remoteInstanceId = txt.instanceId;
  if (!remoteInstanceId || remoteInstanceId === instanceId) {
    return; // Skip self or services without instanceId
  }

  const address =
    service.addresses && service.addresses.length > 0
      ? service.addresses.find((a: string) => !a.includes(':')) || service.addresses[0]
      : service.host;

  // Debounce: skip if we're already processing this address:port
  const addrKey = `${address}:${service.port}`;
  if (pendingUpserts.has(addrKey)) return;
  pendingUpserts.add(addrKey);

  try {
    // Check if a host already exists at this address:port (handles instanceId rotation
    // when a remote instance restarts and generates a new instanceId)
    const existingByAddress = await prisma.host.findFirst({
      where: { address, port: service.port },
    });

    if (existingByAddress) {
      // Update the existing row — including instanceId if it changed
      await prisma.host.update({
        where: { id: existingByAddress.id },
        data: {
          name: service.name,
          instanceId: remoteInstanceId,
          source: 'mdns',
          isOnline: true,
          lastSeen: new Date(),
        },
      });
      if (existingByAddress.instanceId !== remoteInstanceId) {
        console.log(`[mDNS] Updated host (instanceId rotated): ${service.name} at ${addrKey}`);
      }
      return;
    }

    // No existing host at this address:port — also check by instanceId
    await prisma.host.upsert({
      where: { instanceId: remoteInstanceId },
      update: {
        name: service.name,
        address: address,
        port: service.port,
        source: 'mdns',
        isOnline: true,
        lastSeen: new Date(),
      },
      create: {
        name: service.name,
        address: address,
        port: service.port,
        instanceId: remoteInstanceId,
        source: 'mdns',
        isOnline: true,
        lastSeen: new Date(),
      },
    });
    console.log(`[mDNS] Discovered host: ${service.name} at ${addrKey}`);
  } catch (err) {
    console.error('[mDNS] Error upserting host:', err);
  } finally {
    pendingUpserts.delete(addrKey);
  }
}

async function handleServiceDown(service: { txt?: Record<string, string> }) {
  const txt = service.txt || {};
  const remoteInstanceId = txt.instanceId;
  if (!remoteInstanceId || remoteInstanceId === instanceId) {
    return;
  }

  try {
    await prisma.host.updateMany({
      where: { instanceId: remoteInstanceId },
      data: { isOnline: false },
    });
    console.log(`[mDNS] Host went offline: instanceId=${remoteInstanceId}`);
  } catch (err) {
    console.error('[mDNS] Error marking host offline:', err);
  }
}

/** Remove duplicate Host rows that share the same address:port, keeping the most recently seen. */
async function deduplicateHosts(): Promise<void> {
  const hosts = await prisma.host.findMany({ orderBy: { lastSeen: 'desc' } });
  const seen = new Map<string, string>(); // "address:port" -> id to keep
  const toDelete: string[] = [];

  for (const host of hosts) {
    const key = `${host.address}:${host.port}`;
    if (seen.has(key)) {
      toDelete.push(host.id);
    } else {
      seen.set(key, host.id);
    }
  }

  if (toDelete.length > 0) {
    await prisma.host.deleteMany({ where: { id: { in: toDelete } } });
    console.log(`[mDNS] Cleaned up ${toDelete.length} duplicate host(s)`);
  }
}

export async function startMdns(): Promise<void> {
  const enabled = await isMdnsEnabled();
  if (!enabled) {
    console.log('[mDNS] Disabled by configuration, skipping');
    return;
  }

  // Clean up any duplicate hosts from previous runs (e.g. instanceId rotation)
  await deduplicateHosts();

  instanceId = await getOrCreateInstanceId();
  const hostname = os.hostname();

  bonjour = new Bonjour();

  // Publish this instance
  bonjour.publish({
    name: `AI Toolkit - ${hostname}`,
    type: SERVICE_TYPE,
    port: PORT,
    txt: {
      version: VERSION,
      instanceId: instanceId,
      port: String(PORT),
    },
  });
  console.log(`[mDNS] Publishing as "AI Toolkit - ${hostname}" on port ${PORT} (instanceId: ${instanceId})`);

  // Browse for other instances
  browser = bonjour.find({ type: SERVICE_TYPE });
  browser.on('up', service => {
    handleServiceUp(service).catch(err => console.error('[mDNS] Error handling service up:', err));
  });
  browser.on('down', service => {
    handleServiceDown(service).catch(err => console.error('[mDNS] Error handling service down:', err));
  });
  console.log('[mDNS] Browsing for ai-toolkit services');
}

export function stopMdns(): void {
  if (bonjour) {
    bonjour.destroy();
    bonjour = null;
    browser = null;
    console.log('[mDNS] Stopped');
  }
}
