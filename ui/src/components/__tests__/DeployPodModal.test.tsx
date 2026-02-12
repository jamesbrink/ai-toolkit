import { describe, it, expect } from 'vitest';
import { GpuTypeInfo } from '@/hooks/useRunPodGpuTypes';

// Re-implement the sort logic from DeployPodModal to test it in isolation
function sortGpus(gpus: GpuTypeInfo[], cloudType: 'COMMUNITY' | 'SECURE'): GpuTypeInfo[] {
  const stockOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  return [...gpus].sort((a, b) => {
    const aStock = a.lowestPrice?.stockStatus;
    const bStock = b.lowestPrice?.stockStatus;
    const aOrder = aStock ? (stockOrder[aStock] ?? 3) : 4;
    const bOrder = bStock ? (stockOrder[bStock] ?? 3) : 4;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aPrice = (cloudType === 'SECURE' ? a.securePrice : a.communityPrice) ?? Infinity;
    const bPrice = (cloudType === 'SECURE' ? b.securePrice : b.communityPrice) ?? Infinity;
    return aPrice - bPrice;
  });
}

function makeGpu(overrides: Partial<GpuTypeInfo> = {}): GpuTypeInfo {
  return {
    id: 'gpu-1',
    displayName: 'Test GPU',
    memoryInGb: 24,
    secureCloud: true,
    communityCloud: true,
    communityPrice: 0.5,
    securePrice: 0.8,
    lowestPrice: { stockStatus: 'High', rentedCount: 10, totalCount: 100 },
    communitySpotPrice: 0.3,
    secureSpotPrice: 0.5,
    maxGpuCount: 8,
    maxGpuCountCommunityCloud: 4,
    maxGpuCountSecureCloud: 8,
    nodeGroupDatacenters: [],
    ...overrides,
  };
}

describe('sortGpus', () => {
  it('sorts by stock status: High > Medium > Low > unavailable', () => {
    const gpus = [
      makeGpu({ id: 'low', lowestPrice: { stockStatus: 'Low', rentedCount: 90, totalCount: 100 } }),
      makeGpu({ id: 'none', lowestPrice: null }),
      makeGpu({ id: 'high', lowestPrice: { stockStatus: 'High', rentedCount: 10, totalCount: 100 } }),
      makeGpu({ id: 'med', lowestPrice: { stockStatus: 'Medium', rentedCount: 50, totalCount: 100 } }),
    ];

    const sorted = sortGpus(gpus, 'COMMUNITY');
    expect(sorted.map(g => g.id)).toEqual(['high', 'med', 'low', 'none']);
  });

  it('sorts by price within same stock status (community)', () => {
    const gpus = [
      makeGpu({ id: 'expensive', communityPrice: 2.0, lowestPrice: { stockStatus: 'High', rentedCount: 0, totalCount: 10 } }),
      makeGpu({ id: 'cheap', communityPrice: 0.5, lowestPrice: { stockStatus: 'High', rentedCount: 0, totalCount: 10 } }),
      makeGpu({ id: 'mid', communityPrice: 1.0, lowestPrice: { stockStatus: 'High', rentedCount: 0, totalCount: 10 } }),
    ];

    const sorted = sortGpus(gpus, 'COMMUNITY');
    expect(sorted.map(g => g.id)).toEqual(['cheap', 'mid', 'expensive']);
  });

  it('sorts by secure price when cloudType is SECURE', () => {
    const gpus = [
      makeGpu({ id: 'a', securePrice: 3.0, communityPrice: 0.1, lowestPrice: { stockStatus: 'High', rentedCount: 0, totalCount: 10 } }),
      makeGpu({ id: 'b', securePrice: 1.0, communityPrice: 5.0, lowestPrice: { stockStatus: 'High', rentedCount: 0, totalCount: 10 } }),
    ];

    const sorted = sortGpus(gpus, 'SECURE');
    expect(sorted.map(g => g.id)).toEqual(['b', 'a']);
  });

  it('handles null prices by treating them as Infinity', () => {
    const gpus = [
      makeGpu({ id: 'no-price', communityPrice: null, lowestPrice: { stockStatus: 'High', rentedCount: 0, totalCount: 10 } }),
      makeGpu({ id: 'has-price', communityPrice: 1.0, lowestPrice: { stockStatus: 'High', rentedCount: 0, totalCount: 10 } }),
    ];

    const sorted = sortGpus(gpus, 'COMMUNITY');
    expect(sorted.map(g => g.id)).toEqual(['has-price', 'no-price']);
  });

  it('does not mutate the original array', () => {
    const gpus = [
      makeGpu({ id: 'b', communityPrice: 2.0 }),
      makeGpu({ id: 'a', communityPrice: 1.0 }),
    ];

    sortGpus(gpus, 'COMMUNITY');
    expect(gpus[0].id).toBe('b');
  });

  it('returns empty array for empty input', () => {
    expect(sortGpus([], 'COMMUNITY')).toEqual([]);
  });
});

describe('stock badge logic', () => {
  const stockBadge: Record<string, { color: string; label: string }> = {
    High: { color: 'bg-green-900 text-green-300', label: 'High' },
    Medium: { color: 'bg-yellow-900 text-yellow-300', label: 'Medium' },
    Low: { color: 'bg-red-900 text-red-300', label: 'Low' },
  };

  function getStockBadge(status: string | null | undefined) {
    if (!status) return null;
    return stockBadge[status] || null;
  }

  it('returns green badge for High stock', () => {
    expect(getStockBadge('High')).toEqual({ color: 'bg-green-900 text-green-300', label: 'High' });
  });

  it('returns yellow badge for Medium stock', () => {
    expect(getStockBadge('Medium')).toEqual({ color: 'bg-yellow-900 text-yellow-300', label: 'Medium' });
  });

  it('returns red badge for Low stock', () => {
    expect(getStockBadge('Low')).toEqual({ color: 'bg-red-900 text-red-300', label: 'Low' });
  });

  it('returns null for null status', () => {
    expect(getStockBadge(null)).toBeNull();
  });

  it('returns null for undefined status', () => {
    expect(getStockBadge(undefined)).toBeNull();
  });

  it('returns null for unknown status string', () => {
    expect(getStockBadge('OutOfStock')).toBeNull();
  });
});
