import { describe, it, expect } from 'vitest';
import type { ManifestEntry, DatasetManifest } from '@/types';
import { diffManifests, computeFingerprint } from '@/server/datasetManifest';

function makeEntry(overrides: Partial<ManifestEntry> & { path: string }): ManifestEntry {
  return {
    size: 1024,
    mtime: Date.now(),
    type: 'image',
    ...overrides,
  };
}

function makeManifest(entries: ManifestEntry[], name = 'test-dataset'): DatasetManifest {
  return {
    datasetName: name,
    generatedAt: Date.now(),
    entries,
    fingerprint: computeFingerprint(entries),
  };
}

describe('diffManifests', () => {
  it('returns synced for identical manifests', () => {
    const entries = [makeEntry({ path: 'img001.png' }), makeEntry({ path: 'img002.png' })];
    const local = makeManifest(entries);
    const remote = makeManifest(entries);

    const result = diffManifests(local, remote);
    expect(result.status).toBe('synced');
    expect(result.summary.identical).toBe(2);
    expect(result.summary.localOnly).toBe(0);
    expect(result.summary.remoteOnly).toBe(0);
    expect(result.summary.modified).toBe(0);
    expect(result.summary.captionConflicts).toBe(0);
  });

  it('detects local-only entries', () => {
    const local = makeManifest([
      makeEntry({ path: 'img001.png' }),
      makeEntry({ path: 'img002.png' }),
      makeEntry({ path: 'img003.png' }),
    ]);
    const remote = makeManifest([]);

    const result = diffManifests(local, remote);
    expect(result.status).toBe('diverged');
    expect(result.summary.localOnly).toBe(3);
  });

  it('detects remote-only entries', () => {
    const local = makeManifest([]);
    const remote = makeManifest([
      makeEntry({ path: 'img001.png' }),
      makeEntry({ path: 'img002.png' }),
      makeEntry({ path: 'img003.png' }),
      makeEntry({ path: 'img004.png' }),
      makeEntry({ path: 'img005.png' }),
    ]);

    const result = diffManifests(local, remote);
    expect(result.status).toBe('diverged');
    expect(result.summary.remoteOnly).toBe(5);
  });

  it('detects modified entries (same path, different size)', () => {
    const local = makeManifest([makeEntry({ path: 'img001.png', size: 1024 })]);
    const remote = makeManifest([makeEntry({ path: 'img001.png', size: 2048 })]);

    const result = diffManifests(local, remote);
    expect(result.status).toBe('diverged');
    expect(result.summary.modified).toBe(1);
    expect(result.entries[0].status).toBe('modified');
  });

  it('treats same path, same size, no content hash as identical', () => {
    const local = makeManifest([makeEntry({ path: 'img001.png', size: 1024 })]);
    const remote = makeManifest([makeEntry({ path: 'img001.png', size: 1024 })]);

    const result = diffManifests(local, remote);
    expect(result.status).toBe('synced');
    expect(result.summary.identical).toBe(1);
  });

  it('treats same path, same size, same content hash as identical', () => {
    const hash = 'abc123def456';
    const local = makeManifest([makeEntry({ path: 'img001.png', size: 1024, contentHash: hash })]);
    const remote = makeManifest([makeEntry({ path: 'img001.png', size: 1024, contentHash: hash })]);

    const result = diffManifests(local, remote);
    expect(result.status).toBe('synced');
    expect(result.summary.identical).toBe(1);
  });

  it('detects modified when same path, same size, different content hash', () => {
    const local = makeManifest([makeEntry({ path: 'img001.png', size: 1024, contentHash: 'aaa' })]);
    const remote = makeManifest([makeEntry({ path: 'img001.png', size: 1024, contentHash: 'bbb' })]);

    const result = diffManifests(local, remote);
    expect(result.status).toBe('diverged');
    expect(result.summary.modified).toBe(1);
  });

  it('detects caption conflicts', () => {
    const local = makeManifest([makeEntry({ path: 'img001.txt', type: 'caption', size: 100, contentHash: 'aaa' })]);
    const remote = makeManifest([makeEntry({ path: 'img001.txt', type: 'caption', size: 120, contentHash: 'bbb' })]);

    const result = diffManifests(local, remote);
    expect(result.status).toBe('diverged');
    expect(result.summary.captionConflicts).toBe(1);
    expect(result.entries[0].status).toBe('caption_conflict');
  });

  it('treats captions with same size and no hash as identical', () => {
    const local = makeManifest([makeEntry({ path: 'img001.txt', type: 'caption', size: 100 })]);
    const remote = makeManifest([makeEntry({ path: 'img001.txt', type: 'caption', size: 100 })]);

    const result = diffManifests(local, remote);
    expect(result.status).toBe('synced');
    expect(result.summary.identical).toBe(1);
  });

  it('detects caption conflict when same path, different size, no hash', () => {
    const local = makeManifest([makeEntry({ path: 'img001.txt', type: 'caption', size: 100 })]);
    const remote = makeManifest([makeEntry({ path: 'img001.txt', type: 'caption', size: 200 })]);

    const result = diffManifests(local, remote);
    expect(result.summary.captionConflicts).toBe(1);
  });

  it('classifies caption on one side only correctly', () => {
    const local = makeManifest([makeEntry({ path: 'img001.txt', type: 'caption' })]);
    const remote = makeManifest([]);

    const result = diffManifests(local, remote);
    expect(result.summary.localOnly).toBe(1);
    const entry = result.entries.find(e => e.path === 'img001.txt');
    expect(entry?.type).toBe('caption');
    expect(entry?.status).toBe('local_only');
  });

  it('handles mixed scenario correctly', () => {
    const local = makeManifest([
      // 3 identical images
      makeEntry({ path: 'img001.png', size: 100 }),
      makeEntry({ path: 'img002.png', size: 200 }),
      makeEntry({ path: 'img003.png', size: 300 }),
      // 2 local-only images
      makeEntry({ path: 'local_only1.png' }),
      makeEntry({ path: 'local_only2.png' }),
      // 1 modified
      makeEntry({ path: 'modified.png', size: 500 }),
      // 1 caption conflict
      makeEntry({ path: 'caption.txt', type: 'caption', size: 50, contentHash: 'local_hash' }),
    ]);
    const remote = makeManifest([
      // 3 identical images
      makeEntry({ path: 'img001.png', size: 100 }),
      makeEntry({ path: 'img002.png', size: 200 }),
      makeEntry({ path: 'img003.png', size: 300 }),
      // 3 remote-only images
      makeEntry({ path: 'remote_only1.png' }),
      makeEntry({ path: 'remote_only2.png' }),
      makeEntry({ path: 'remote_only3.png' }),
      // 1 modified
      makeEntry({ path: 'modified.png', size: 999 }),
      // 1 caption conflict
      makeEntry({ path: 'caption.txt', type: 'caption', size: 80, contentHash: 'remote_hash' }),
    ]);

    const result = diffManifests(local, remote);
    expect(result.status).toBe('diverged');
    expect(result.summary.identical).toBe(3);
    expect(result.summary.localOnly).toBe(2);
    expect(result.summary.remoteOnly).toBe(3);
    expect(result.summary.modified).toBe(1);
    expect(result.summary.captionConflicts).toBe(1);
  });

  it('returns synced with all zeros for empty manifests', () => {
    const local = makeManifest([]);
    const remote = makeManifest([]);

    const result = diffManifests(local, remote);
    expect(result.status).toBe('synced');
    expect(result.summary).toEqual({
      identical: 0,
      localOnly: 0,
      remoteOnly: 0,
      modified: 0,
      captionConflicts: 0,
    });
  });
});

describe('diffManifests pHash cross-matching', () => {
  // pHash hex strings: 16 chars each (64 bits)
  // Same hash = hamming distance 0
  const hashA = 'abcdef0123456789';
  // Differ by 1 hex digit (4 -> 5 = binary 0100 -> 0101 = 1 bit difference)
  const hashA_close = 'abcdef0123456589';
  // Completely different hash
  const hashB = '0000000000000000';

  it('matches unmatched images with same pHash (distance 0)', () => {
    const local = makeManifest([makeEntry({ path: 'IMG_2847.jpg', pHash: hashA })]);
    const remote = makeManifest([makeEntry({ path: 'photo_001.jpg', pHash: hashA })]);

    const result = diffManifests(local, remote);
    const localEntry = result.entries.find(e => e.path === 'IMG_2847.jpg');
    expect(localEntry?.pHashMatch).toBeDefined();
    expect(localEntry?.pHashMatch?.remotePath).toBe('photo_001.jpg');
    expect(localEntry?.pHashMatch?.distance).toBe(0);
  });

  it('matches images with hamming distance within threshold', () => {
    const local = makeManifest([makeEntry({ path: 'local.jpg', pHash: hashA })]);
    const remote = makeManifest([makeEntry({ path: 'remote.jpg', pHash: hashA_close })]);

    const result = diffManifests(local, remote);
    const localEntry = result.entries.find(e => e.path === 'local.jpg');
    expect(localEntry?.pHashMatch).toBeDefined();
    expect(localEntry?.pHashMatch?.distance).toBeLessThanOrEqual(10);
  });

  it('does not match images with hamming distance above threshold', () => {
    const local = makeManifest([makeEntry({ path: 'local.jpg', pHash: hashA })]);
    const remote = makeManifest([makeEntry({ path: 'remote.jpg', pHash: hashB })]);

    const result = diffManifests(local, remote);
    const localEntry = result.entries.find(e => e.path === 'local.jpg');
    expect(localEntry?.pHashMatch).toBeUndefined();
    expect(localEntry?.status).toBe('local_only');

    const remoteEntry = result.entries.find(e => e.path === 'remote.jpg');
    expect(remoteEntry?.status).toBe('remote_only');
  });

  it('picks closest match when multiple candidates exist', () => {
    const local = makeManifest([makeEntry({ path: 'local.jpg', pHash: hashA })]);
    const remote = makeManifest([
      makeEntry({ path: 'far.jpg', pHash: hashA_close }), // distance ~1
      makeEntry({ path: 'exact.jpg', pHash: hashA }), // distance 0
    ]);

    const result = diffManifests(local, remote);
    const localEntry = result.entries.find(e => e.path === 'local.jpg');
    expect(localEntry?.pHashMatch?.remotePath).toBe('exact.jpg');
    expect(localEntry?.pHashMatch?.distance).toBe(0);
  });

  it('gracefully skips matching when no pHash data is available', () => {
    const local = makeManifest([makeEntry({ path: 'local.jpg' })]); // no pHash
    const remote = makeManifest([makeEntry({ path: 'remote.jpg' })]); // no pHash

    const result = diffManifests(local, remote);
    expect(result.summary.localOnly).toBe(1);
    expect(result.summary.remoteOnly).toBe(1);
    // No errors thrown
  });
});

describe('computeFingerprint', () => {
  it('produces same fingerprint for entries in different order', () => {
    const entries1 = [makeEntry({ path: 'b.png', size: 200 }), makeEntry({ path: 'a.png', size: 100 })];
    const entries2 = [makeEntry({ path: 'a.png', size: 100 }), makeEntry({ path: 'b.png', size: 200 })];

    expect(computeFingerprint(entries1)).toBe(computeFingerprint(entries2));
  });

  it('produces different fingerprint when one byte size changes', () => {
    const entries1 = [makeEntry({ path: 'a.png', size: 100 })];
    const entries2 = [makeEntry({ path: 'a.png', size: 101 })];

    expect(computeFingerprint(entries1)).not.toBe(computeFingerprint(entries2));
  });

  it('produces different fingerprint when content hash differs', () => {
    const entries1 = [makeEntry({ path: 'a.png', size: 100, contentHash: 'hash1' })];
    const entries2 = [makeEntry({ path: 'a.png', size: 100, contentHash: 'hash2' })];

    expect(computeFingerprint(entries1)).not.toBe(computeFingerprint(entries2));
  });

  it('produces consistent fingerprint for empty entries', () => {
    expect(computeFingerprint([])).toBe(computeFingerprint([]));
  });
});
