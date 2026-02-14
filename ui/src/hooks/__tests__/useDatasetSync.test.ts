import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useDatasetSync from '@/hooks/useDatasetSync';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
vi.stubGlobal('localStorage', mockLocalStorage);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDatasetSync', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useDatasetSync());
    expect(result.current.status).toBe('idle');
    expect(result.current.diff).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('transitions to comparing then ready on successful compare', async () => {
    const mockDiff = {
      status: 'diverged',
      summary: { identical: 5, localOnly: 2, remoteOnly: 3, modified: 1, captionConflicts: 0 },
      entries: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDiff),
    });

    const { result } = renderHook(() => useDatasetSync());

    await act(async () => {
      await result.current.compare('test-dataset', 'host-1');
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.diff).toEqual(mockDiff);
    expect(result.current.error).toBeNull();
  });

  it('transitions to error on compare failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Dataset not found' }),
    });

    const { result } = renderHook(() => useDatasetSync());

    await act(async () => {
      await result.current.compare('missing-dataset', 'host-1');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Dataset not found');
  });

  it('transitions to error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useDatasetSync());

    await act(async () => {
      await result.current.compare('test-dataset', 'host-1');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Network error');
  });

  it('resets all state', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'synced', summary: {}, entries: [] }),
    });

    const { result } = renderHook(() => useDatasetSync());

    await act(async () => {
      await result.current.compare('test-dataset', 'host-1');
    });

    expect(result.current.status).toBe('ready');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.diff).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('mergeCaption returns merged text on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ mergedCaption: 'combined caption text' }),
    });

    const { result } = renderHook(() => useDatasetSync());

    let merged: string | null = null;
    await act(async () => {
      merged = await result.current.mergeCaption('local caption', 'remote caption');
    });

    expect(merged).toBe('combined caption text');
  });

  it('mergeCaption returns null on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const { result } = renderHook(() => useDatasetSync());

    let merged: string | null = null;
    await act(async () => {
      merged = await result.current.mergeCaption('local', 'remote');
    });

    expect(merged).toBeNull();
  });
});
