import prisma from '@/server/prisma';
import { buildHostBaseUrl } from '@/server/hostUrl';
import { executeServerTool } from './serverTools';

/**
 * Execute a server tool either locally or on a remote host.
 *
 * When hostId is null/undefined, delegates to the local executeServerTool().
 * When hostId is set, POSTs to the remote host's /api/claude/tools/execute endpoint.
 */
export async function executeToolMaybeRemote(
  toolName: string,
  input: Record<string, unknown>,
  hostId?: string | null,
): Promise<string> {
  if (!hostId) {
    console.log(`[claude-chat] executeToolMaybeRemote: local execution of ${toolName}`);
    return executeServerTool(toolName, input);
  }

  const host = await prisma.host.findUnique({ where: { id: hostId } });
  if (!host) {
    console.error(`[claude-chat] executeToolMaybeRemote: host "${hostId}" not found`);
    return `Error: host "${hostId}" not found`;
  }

  const targetUrl = `${buildHostBaseUrl(host.address, host.port)}/api/claude/tools/execute`;
  console.log(`[claude-chat] executeToolMaybeRemote: remote ${toolName} → ${host.address}:${host.port}`);
  const fetchStart = Date.now();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (host.authToken) {
    headers['Authorization'] = `Bearer ${host.authToken}`;
  }

  const controller = new AbortController();
  // 120s timeout for heavy operations (analysis, face crop)
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ toolName, input }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    console.log(
      `[claude-chat] Remote tool ${toolName} response: status=${response.status}, elapsed=${Date.now() - fetchStart}ms`,
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(`[claude-chat] Remote tool ${toolName} error: ${response.status} ${text.slice(0, 200)}`);
      return `Error from remote host (${response.status}): ${text}`;
    }

    const data = await response.json();
    return data.result ?? 'No result returned from remote host';
  } catch (error: unknown) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[claude-chat] Remote tool ${toolName} timed out after ${Date.now() - fetchStart}ms`);
      return 'Error: remote tool execution timed out (120s)';
    }
    console.error(
      `[claude-chat] Remote tool ${toolName} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return `Error: remote host unreachable — ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Fetch raw image bytes from a remote host's /api/files/{path} endpoint.
 * Returns the image buffer and media type, or null if the fetch fails.
 */
export async function fetchRemoteImageBytes(
  imagePath: string,
  hostId: string,
): Promise<{ buffer: Buffer; mediaType: string } | null> {
  const host = await prisma.host.findUnique({ where: { id: hostId } });
  if (!host) return null;

  const targetUrl = `${buildHostBaseUrl(host.address, host.port)}/api/files/${encodeURIComponent(imagePath)}`;
  const headers: Record<string, string> = {};
  if (host.authToken) {
    headers['Authorization'] = `Bearer ${host.authToken}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(targetUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mediaType: contentType };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Fetch settings (DATASETS_FOLDER, TRAINING_FOLDER, TOOLKIT_ROOT) from a remote host.
 * Used by the system prompt builder to inject remote paths.
 */
export async function fetchRemoteSettings(
  hostId: string,
): Promise<{ toolkitRoot: string; datasetsRoot: string; trainingFolder: string } | null> {
  const host = await prisma.host.findUnique({ where: { id: hostId } });
  if (!host) return null;

  const targetUrl = `${buildHostBaseUrl(host.address, host.port)}/api/settings`;
  const headers: Record<string, string> = {};
  if (host.authToken) {
    headers['Authorization'] = `Bearer ${host.authToken}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(targetUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    // The settings API returns an array of {key, value} rows or an object.
    // Extract what we need — fall back to reasonable defaults.
    let toolkitRoot = '';
    let datasetsRoot = '';
    let trainingFolder = '';

    if (Array.isArray(data)) {
      for (const row of data) {
        if (row.key === 'TOOLKIT_ROOT') toolkitRoot = row.value;
        if (row.key === 'DATASETS_FOLDER') datasetsRoot = row.value;
        if (row.key === 'TRAINING_FOLDER') trainingFolder = row.value;
      }
    }

    // If settings API doesn't return paths, try the identify endpoint for hostname
    if (!toolkitRoot && !datasetsRoot && !trainingFolder) {
      return null;
    }

    return { toolkitRoot, datasetsRoot, trainingFolder };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}
