import { describe, it, expect } from 'vitest';
import { getDeviceBadgeColor } from '../deviceBadge';

describe('getDeviceBadgeColor', () => {
  it('returns green for nvidia', () => {
    expect(getDeviceBadgeColor('nvidia')).toBe('green');
  });

  it('returns blue for mps', () => {
    expect(getDeviceBadgeColor('mps')).toBe('blue');
  });

  it('returns zinc for cpu', () => {
    expect(getDeviceBadgeColor('cpu')).toBe('zinc');
  });

  it('returns zinc for unknown device types', () => {
    expect(getDeviceBadgeColor('')).toBe('zinc');
    expect(getDeviceBadgeColor('tpu')).toBe('zinc');
    expect(getDeviceBadgeColor('amd')).toBe('zinc');
  });
});
