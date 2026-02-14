import { describe, it, expect } from 'vitest';
import type { SourcedDatasetInfo, DataSource } from '@/types';
import { groupDatasets } from '@/hooks/useAllDatasets';

const localSource: DataSource = { type: 'local' };
const remoteSourceA: DataSource = { type: 'remote', hostId: 'host-a', hostName: 'HostA', isOnline: true };
const remoteSourceB: DataSource = { type: 'remote', hostId: 'host-b', hostName: 'HostB', isOnline: true };

function makeDataset(name: string, source: DataSource, overrides?: Partial<SourcedDatasetInfo>): SourcedDatasetInfo {
  return {
    name,
    imageCount: 100,
    captionCount: 100,
    totalSizeBytes: 50000,
    lastModified: Date.now(),
    source,
    ...overrides,
  };
}

describe('groupDatasets', () => {
  it('returns empty output for empty input', () => {
    const result = groupDatasets([]);
    expect(result.groupedDatasets).toEqual([]);
  });

  it('creates a local_only group for a single local dataset', () => {
    const datasets = [makeDataset('my-dataset', localSource)];
    const result = groupDatasets(datasets);

    expect(result.groupedDatasets).toHaveLength(1);
    expect(result.groupedDatasets[0].name).toBe('my-dataset');
    expect(result.groupedDatasets[0].syncStatus).toBe('local_only');
    expect(result.groupedDatasets[0].instances).toHaveLength(1);
  });

  it('creates a remote_only group for a single remote dataset', () => {
    const datasets = [makeDataset('remote-ds', remoteSourceA)];
    const result = groupDatasets(datasets);

    expect(result.groupedDatasets).toHaveLength(1);
    expect(result.groupedDatasets[0].syncStatus).toBe('remote_only');
  });

  it('marks synced when same name on 2 hosts with identical counts', () => {
    const datasets = [
      makeDataset('shared', localSource, { imageCount: 150, captionCount: 150, totalSizeBytes: 75000 }),
      makeDataset('shared', remoteSourceA, { imageCount: 150, captionCount: 150, totalSizeBytes: 75000 }),
    ];
    const result = groupDatasets(datasets);

    expect(result.groupedDatasets).toHaveLength(1);
    expect(result.groupedDatasets[0].syncStatus).toBe('synced');
    expect(result.groupedDatasets[0].instances).toHaveLength(2);
  });

  it('marks diverged when image counts differ', () => {
    const datasets = [
      makeDataset('shared', localSource, { imageCount: 150 }),
      makeDataset('shared', remoteSourceA, { imageCount: 165 }),
    ];
    const result = groupDatasets(datasets);

    expect(result.groupedDatasets).toHaveLength(1);
    expect(result.groupedDatasets[0].syncStatus).toBe('diverged');
    expect(result.groupedDatasets[0].hintText).toContain('+15');
    expect(result.groupedDatasets[0].hintText).toContain('HostA');
  });

  it('mentions captions when caption count differs but image count matches', () => {
    const datasets = [
      makeDataset('shared', localSource, { imageCount: 100, captionCount: 80 }),
      makeDataset('shared', remoteSourceA, { imageCount: 100, captionCount: 100 }),
    ];
    const result = groupDatasets(datasets);

    expect(result.groupedDatasets[0].syncStatus).toBe('diverged');
    expect(result.groupedDatasets[0].hintText).toContain('caption');
  });

  it('handles 3 hosts where 2 match and 1 differs', () => {
    const datasets = [
      makeDataset('shared', localSource, { imageCount: 100 }),
      makeDataset('shared', remoteSourceA, { imageCount: 100 }),
      makeDataset('shared', remoteSourceB, { imageCount: 120 }),
    ];
    const result = groupDatasets(datasets);

    expect(result.groupedDatasets).toHaveLength(1);
    expect(result.groupedDatasets[0].syncStatus).toBe('diverged');
    expect(result.groupedDatasets[0].instances).toHaveLength(3);
  });

  it('creates separate groups for different dataset names', () => {
    const datasets = [makeDataset('alpha', localSource), makeDataset('beta', localSource)];
    const result = groupDatasets(datasets);

    expect(result.groupedDatasets).toHaveLength(2);
    const names = result.groupedDatasets.map(g => g.name);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
  });

  it('sorts groups alphabetically by name', () => {
    const datasets = [
      makeDataset('zebra', localSource),
      makeDataset('alpha', localSource),
      makeDataset('middle', localSource),
    ];
    const result = groupDatasets(datasets);

    expect(result.groupedDatasets.map(g => g.name)).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('returns flat datasets alongside grouped', () => {
    const datasets = [makeDataset('ds1', localSource), makeDataset('ds1', remoteSourceA)];
    const result = groupDatasets(datasets);

    expect(result.flatDatasets).toHaveLength(2);
    expect(result.groupedDatasets).toHaveLength(1);
  });
});
