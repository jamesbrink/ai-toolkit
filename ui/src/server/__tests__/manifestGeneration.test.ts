import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateManifest } from '@/server/datasetManifest';

// Mock prisma to avoid DB dependency in tests
vi.mock('@/server/prisma', () => ({
  default: {
    imageAnalysis: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('generateManifest', () => {
  it('returns empty manifest for empty directory', async () => {
    const manifest = await generateManifest(tempDir);
    expect(manifest.entries).toHaveLength(0);
    expect(manifest.datasetName).toBeTruthy();
  });

  it('finds images and captions with correct types', async () => {
    await writeFile(join(tempDir, 'img001.png'), Buffer.alloc(100));
    await writeFile(join(tempDir, 'img002.jpg'), Buffer.alloc(200));
    await writeFile(join(tempDir, 'img001.txt'), 'a caption');
    await writeFile(join(tempDir, 'img002.txt'), 'another caption');

    const manifest = await generateManifest(tempDir);
    expect(manifest.entries).toHaveLength(4);

    const images = manifest.entries.filter(e => e.type === 'image');
    const captions = manifest.entries.filter(e => e.type === 'caption');
    expect(images).toHaveLength(2);
    expect(captions).toHaveLength(2);
  });

  it('preserves relative paths for nested subdirectories', async () => {
    await mkdir(join(tempDir, 'sub'), { recursive: true });
    await writeFile(join(tempDir, 'sub', 'nested.png'), Buffer.alloc(50));

    const manifest = await generateManifest(tempDir);
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].path).toBe('sub/nested.png');
  });

  it('skips _controls directory', async () => {
    await mkdir(join(tempDir, '_controls'), { recursive: true });
    await writeFile(join(tempDir, '_controls', 'ctrl.png'), Buffer.alloc(50));
    await writeFile(join(tempDir, 'normal.png'), Buffer.alloc(50));

    const manifest = await generateManifest(tempDir);
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].path).toBe('normal.png');
  });

  it('skips hidden files', async () => {
    await writeFile(join(tempDir, '.hidden.png'), Buffer.alloc(50));
    await writeFile(join(tempDir, 'visible.png'), Buffer.alloc(50));

    const manifest = await generateManifest(tempDir);
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].path).toBe('visible.png');
  });

  it('computes contentHash when rich is true', async () => {
    await writeFile(join(tempDir, 'img.png'), Buffer.alloc(100));

    const manifest = await generateManifest(tempDir, { rich: true });
    expect(manifest.entries[0].contentHash).toBeDefined();
    expect(manifest.entries[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not compute contentHash when rich is false', async () => {
    await writeFile(join(tempDir, 'img.png'), Buffer.alloc(100));

    const manifest = await generateManifest(tempDir, { rich: false });
    expect(manifest.entries[0].contentHash).toBeUndefined();
  });

  it('generates a fingerprint', async () => {
    await writeFile(join(tempDir, 'img.png'), Buffer.alloc(100));

    const manifest = await generateManifest(tempDir);
    expect(manifest.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
