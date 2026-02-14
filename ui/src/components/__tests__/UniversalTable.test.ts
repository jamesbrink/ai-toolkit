import { describe, it, expect } from 'vitest';

/**
 * Tests for the selection logic used in UniversalTable.
 * These test the pure logic patterns without rendering React components.
 */

describe('UniversalTable selection logic', () => {
  // Simulate the rowKey function pattern
  const rowKey = (row: { id: string }) => row.id;
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  describe('allKeys computation', () => {
    it('computes all keys from rows using rowKey', () => {
      const allKeys = new Set(rows.map(r => rowKey(r)));
      expect(allKeys.size).toBe(3);
      expect(allKeys.has('a')).toBe(true);
      expect(allKeys.has('b')).toBe(true);
      expect(allKeys.has('c')).toBe(true);
    });
  });

  describe('allSelected / someSelected', () => {
    it('allSelected is true when all keys are selected', () => {
      const selectedKeys = new Set(['a', 'b', 'c']);
      const allKeys = new Set(rows.map(r => rowKey(r)));
      const allSelected = selectedKeys.size > 0 && selectedKeys.size >= allKeys.size;
      const someSelected = selectedKeys.size > 0 && !allSelected;
      expect(allSelected).toBe(true);
      expect(someSelected).toBe(false);
    });

    it('someSelected is true when partial selection', () => {
      const selectedKeys = new Set(['a', 'b']);
      const allKeys = new Set(rows.map(r => rowKey(r)));
      const allSelected = selectedKeys.size > 0 && selectedKeys.size >= allKeys.size;
      const someSelected = selectedKeys.size > 0 && !allSelected;
      expect(allSelected).toBe(false);
      expect(someSelected).toBe(true);
    });

    it('neither is true when nothing selected', () => {
      const selectedKeys = new Set<string>();
      const allKeys = new Set(rows.map(r => rowKey(r)));
      const allSelected = selectedKeys.size > 0 && selectedKeys.size >= allKeys.size;
      const someSelected = selectedKeys.size > 0 && !allSelected;
      expect(allSelected).toBe(false);
      expect(someSelected).toBe(false);
    });
  });

  describe('toggleAll', () => {
    it('selects all when not all are selected', () => {
      const selectedKeys = new Set(['a']);
      const allKeys = new Set(rows.map(r => rowKey(r)));
      const allSelected = selectedKeys.size > 0 && selectedKeys.size >= allKeys.size;

      const result = allSelected ? new Set<string>() : new Set(allKeys);
      expect(result.size).toBe(3);
      expect(result).toEqual(allKeys);
    });

    it('deselects all when all are selected', () => {
      const selectedKeys = new Set(['a', 'b', 'c']);
      const allKeys = new Set(rows.map(r => rowKey(r)));
      const allSelected = selectedKeys.size > 0 && selectedKeys.size >= allKeys.size;

      const result = allSelected ? new Set<string>() : new Set(allKeys);
      expect(result.size).toBe(0);
    });
  });

  describe('toggleRow', () => {
    it('adds a key when not selected', () => {
      const selectedKeys = new Set(['a']);
      const key = 'b';
      const next = new Set(selectedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      expect(next.has('a')).toBe(true);
      expect(next.has('b')).toBe(true);
      expect(next.size).toBe(2);
    });

    it('removes a key when already selected', () => {
      const selectedKeys = new Set(['a', 'b']);
      const key = 'b';
      const next = new Set(selectedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      expect(next.has('a')).toBe(true);
      expect(next.has('b')).toBe(false);
      expect(next.size).toBe(1);
    });
  });
});

describe('dataset key generation', () => {
  // Mirrors the datasetKey function in datasets/page.tsx
  const datasetKey = (row: { source: { type: string; hostId?: string }; name: string }) =>
    `${row.source.type}:${row.source.hostId ?? 'local'}:${row.name}`;

  it('generates unique key for local dataset', () => {
    const key = datasetKey({ source: { type: 'local' }, name: 'my-dataset' });
    expect(key).toBe('local:local:my-dataset');
  });

  it('generates unique key for remote dataset', () => {
    const key = datasetKey({ source: { type: 'remote', hostId: 'host-1' }, name: 'my-dataset' });
    expect(key).toBe('remote:host-1:my-dataset');
  });

  it('same name different source produces different keys', () => {
    const localKey = datasetKey({ source: { type: 'local' }, name: 'shared' });
    const remoteKey = datasetKey({ source: { type: 'remote', hostId: 'h1' }, name: 'shared' });
    expect(localKey).not.toBe(remoteKey);
  });

  it('same name different hosts produce different keys', () => {
    const key1 = datasetKey({ source: { type: 'remote', hostId: 'h1' }, name: 'data' });
    const key2 = datasetKey({ source: { type: 'remote', hostId: 'h2' }, name: 'data' });
    expect(key1).not.toBe(key2);
  });
});
