import { createHash } from 'crypto';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import type { ManifestEntry, DatasetManifest, DiffEntry, ManifestDiff } from '@/types';
import { hammingDistance } from '@/server/imageAnalysis';
import prisma from '@/server/prisma';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.tif']);
const CAPTION_EXTENSION = '.txt';
const PHASH_THRESHOLD = 10;

function classifyFileType(filePath: string): 'image' | 'caption' | null {
  const ext = extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ext === CAPTION_EXTENSION) return 'caption';
  return null;
}

/**
 * Generate a manifest for a local dataset directory.
 * Walks the directory, stats each file, and optionally computes SHA-256 content hashes.
 * Reuses existing pHash data from the ImageAnalysis table when available.
 */
export async function generateManifest(
  datasetDir: string,
  options?: { rich?: boolean; datasetName?: string },
): Promise<DatasetManifest> {
  const rich = options?.rich ?? false;
  const datasetName = options?.datasetName ?? basename(datasetDir);

  const entries: ManifestEntry[] = [];
  const dirEntries = await readdir(datasetDir, { withFileTypes: true, recursive: true });

  for (const entry of dirEntries) {
    if (!entry.isFile()) continue;

    // Skip hidden files and _controls directory
    if (entry.name.startsWith('.')) continue;
    const parentDir = entry.parentPath || entry.path || '';
    const relativePath = parentDir ? join(parentDir, entry.name).replace(datasetDir + '/', '') : entry.name;
    if (relativePath.startsWith('_controls')) continue;

    const fileType = classifyFileType(entry.name);
    if (!fileType) continue;

    const fullPath = join(datasetDir, relativePath);
    const fileStat = await stat(fullPath);

    const manifestEntry: ManifestEntry = {
      path: relativePath,
      size: fileStat.size,
      mtime: fileStat.mtimeMs,
      type: fileType,
    };

    if (rich) {
      const fileBuffer = await readFile(fullPath);
      manifestEntry.contentHash = createHash('sha256').update(fileBuffer).digest('hex');
    }

    entries.push(manifestEntry);
  }

  // Load pHash data from ImageAnalysis table for images
  try {
    const imageEntries = entries.filter(e => e.type === 'image');
    if (imageEntries.length > 0) {
      const imagePaths = imageEntries.map(e => join(datasetDir, e.path));
      const analyses = await prisma.imageAnalysis.findMany({
        where: { filePath: { in: imagePaths } },
        select: { filePath: true, pHash: true },
      });

      const pHashMap = new Map(analyses.map(a => [a.filePath, a.pHash]));
      for (const entry of imageEntries) {
        const pHash = pHashMap.get(join(datasetDir, entry.path));
        if (pHash) entry.pHash = pHash;
      }
    }
  } catch {
    // pHash data is optional — continue without it
  }

  const fingerprint = computeFingerprint(entries);

  return {
    datasetName,
    generatedAt: Date.now(),
    entries,
    fingerprint,
  };
}

/**
 * Compute a deterministic fingerprint for a set of manifest entries.
 * SHA-256 of sorted "path:size:contentHash" tuples.
 * Two datasets with the same fingerprint are byte-identical.
 */
export function computeFingerprint(entries: ManifestEntry[]): string {
  const tuples = entries.map(e => `${e.path}:${e.size}:${e.contentHash ?? ''}`).sort();
  return createHash('sha256').update(tuples.join('\n')).digest('hex');
}

/**
 * Strip extension from a filename. e.g. "img001.png" -> "img001"
 */
function stripExtension(filename: string): string {
  const ext = extname(filename);
  return ext ? filename.slice(0, -ext.length) : filename;
}

/**
 * Diff two manifests (local vs remote). Pure function — no I/O.
 *
 * Matching strategy:
 * 1. Match entries by relative path
 * 2. For unmatched images, attempt pHash cross-matching (hamming distance <= threshold)
 * 3. Detect caption conflicts (same image path, caption on both sides with different content hashes)
 */
export function diffManifests(local: DatasetManifest, remote: DatasetManifest): ManifestDiff {
  const summary = { identical: 0, localOnly: 0, remoteOnly: 0, modified: 0, captionConflicts: 0 };
  const entries: DiffEntry[] = [];

  const localMap = new Map(local.entries.map(e => [e.path, e]));
  const remoteMap = new Map(remote.entries.map(e => [e.path, e]));

  const matchedPaths = new Set<string>();

  // Phase 1: Path-based matching
  for (const [path, localEntry] of localMap) {
    const remoteEntry = remoteMap.get(path);
    if (remoteEntry) {
      matchedPaths.add(path);

      if (localEntry.type === 'caption' && remoteEntry.type === 'caption') {
        // Caption: check for conflicts
        if (localEntry.contentHash && remoteEntry.contentHash) {
          if (localEntry.contentHash === remoteEntry.contentHash) {
            summary.identical++;
            entries.push({ path, type: 'caption', status: 'identical', local: localEntry, remote: remoteEntry });
          } else {
            summary.captionConflicts++;
            entries.push({
              path,
              type: 'caption',
              status: 'caption_conflict',
              local: localEntry,
              remote: remoteEntry,
            });
          }
        } else if (localEntry.size === remoteEntry.size) {
          // No content hashes — size match is our best heuristic
          summary.identical++;
          entries.push({ path, type: 'caption', status: 'identical', local: localEntry, remote: remoteEntry });
        } else {
          summary.captionConflicts++;
          entries.push({
            path,
            type: 'caption',
            status: 'caption_conflict',
            local: localEntry,
            remote: remoteEntry,
          });
        }
      } else {
        // Image or mixed: check content identity
        const isIdentical =
          localEntry.contentHash && remoteEntry.contentHash
            ? localEntry.contentHash === remoteEntry.contentHash
            : localEntry.size === remoteEntry.size;

        if (isIdentical) {
          summary.identical++;
          entries.push({ path, type: localEntry.type, status: 'identical', local: localEntry, remote: remoteEntry });
        } else {
          summary.modified++;
          entries.push({ path, type: localEntry.type, status: 'modified', local: localEntry, remote: remoteEntry });
        }
      }
    }
  }

  // Phase 2: Collect unmatched entries
  const unmatchedLocal: ManifestEntry[] = [];
  const unmatchedRemote: ManifestEntry[] = [];

  for (const [path, entry] of localMap) {
    if (!matchedPaths.has(path)) unmatchedLocal.push(entry);
  }
  for (const [path, entry] of remoteMap) {
    if (!matchedPaths.has(path)) unmatchedRemote.push(entry);
  }

  // Phase 3: pHash cross-matching for unmatched images
  const unmatchedLocalImages = unmatchedLocal.filter(e => e.type === 'image' && e.pHash);
  const unmatchedRemoteImages = unmatchedRemote.filter(e => e.type === 'image' && e.pHash);
  const pHashMatchedLocal = new Set<string>();
  const pHashMatchedRemote = new Set<string>();

  if (unmatchedLocalImages.length > 0 && unmatchedRemoteImages.length > 0) {
    for (const localImg of unmatchedLocalImages) {
      let bestMatch: { entry: ManifestEntry; distance: number } | null = null;

      for (const remoteImg of unmatchedRemoteImages) {
        if (pHashMatchedRemote.has(remoteImg.path)) continue;
        try {
          const dist = hammingDistance(localImg.pHash!, remoteImg.pHash!);
          if (dist <= PHASH_THRESHOLD && (!bestMatch || dist < bestMatch.distance)) {
            bestMatch = { entry: remoteImg, distance: dist };
          }
        } catch {
          // Hash length mismatch — skip
        }
      }

      if (bestMatch) {
        pHashMatchedLocal.add(localImg.path);
        pHashMatchedRemote.add(bestMatch.entry.path);

        // Add as local_only with pHash match info
        summary.localOnly++;
        entries.push({
          path: localImg.path,
          type: 'image',
          status: 'local_only',
          local: localImg,
          pHashMatch: { remotePath: bestMatch.entry.path, distance: bestMatch.distance },
        });

        // Also check if both sides have a caption for this image
        const localCaptionPath = stripExtension(localImg.path) + '.txt';
        const remoteCaptionPath = stripExtension(bestMatch.entry.path) + '.txt';
        const localCaption = localMap.get(localCaptionPath);
        const remoteCaption = remoteMap.get(remoteCaptionPath);

        // Mark remote counterpart — don't duplicate as remote_only
        summary.remoteOnly++;
        entries.push({
          path: bestMatch.entry.path,
          type: 'image',
          status: 'remote_only',
          remote: bestMatch.entry,
          pHashMatch: { remotePath: localImg.path, distance: bestMatch.distance },
        });

        // Handle associated captions if they were unmatched
        if (localCaption && !matchedPaths.has(localCaptionPath)) {
          pHashMatchedLocal.add(localCaptionPath);
        }
        if (remoteCaption && !matchedPaths.has(remoteCaptionPath)) {
          pHashMatchedRemote.add(remoteCaptionPath);
        }
      }
    }
  }

  // Phase 4: Remaining unmatched entries
  for (const entry of unmatchedLocal) {
    if (pHashMatchedLocal.has(entry.path)) continue;
    summary.localOnly++;
    entries.push({ path: entry.path, type: entry.type, status: 'local_only', local: entry });
  }
  for (const entry of unmatchedRemote) {
    if (pHashMatchedRemote.has(entry.path)) continue;
    summary.remoteOnly++;
    entries.push({ path: entry.path, type: entry.type, status: 'remote_only', remote: entry });
  }

  const status =
    summary.localOnly === 0 && summary.remoteOnly === 0 && summary.modified === 0 && summary.captionConflicts === 0
      ? 'synced'
      : 'diverged';

  return { status, summary, entries };
}
