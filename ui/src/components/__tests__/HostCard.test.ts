import { describe, it, expect } from 'vitest';

describe('host source badge', () => {
  function getSourceBadge(source: string) {
    if (source === 'mdns') return { label: 'mDNS', style: 'bg-blue-900 text-blue-300' };
    if (source === 'runpod') return { label: 'RunPod', style: 'bg-purple-900 text-purple-300' };
    return { label: 'Manual', style: 'bg-gray-700 text-gray-300' };
  }

  it('returns mDNS badge for mdns source', () => {
    const badge = getSourceBadge('mdns');
    expect(badge.label).toBe('mDNS');
    expect(badge.style).toContain('blue');
  });

  it('returns RunPod badge for runpod source', () => {
    const badge = getSourceBadge('runpod');
    expect(badge.label).toBe('RunPod');
    expect(badge.style).toContain('purple');
  });

  it('returns Manual badge for manual source', () => {
    const badge = getSourceBadge('manual');
    expect(badge.label).toBe('Manual');
    expect(badge.style).toContain('gray');
  });

  it('returns Manual badge for unknown source', () => {
    const badge = getSourceBadge('unknown');
    expect(badge.label).toBe('Manual');
  });
});

describe('host detail source label', () => {
  function getSourceLabel(source: string) {
    if (source === 'mdns') return 'mDNS (auto-discovered)';
    if (source === 'runpod') return 'RunPod (cloud pod)';
    return 'Manual';
  }

  it('returns mDNS label', () => {
    expect(getSourceLabel('mdns')).toBe('mDNS (auto-discovered)');
  });

  it('returns RunPod label', () => {
    expect(getSourceLabel('runpod')).toBe('RunPod (cloud pod)');
  });

  it('returns Manual label for anything else', () => {
    expect(getSourceLabel('manual')).toBe('Manual');
  });
});
