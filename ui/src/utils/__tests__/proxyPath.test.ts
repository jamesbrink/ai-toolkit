import { describe, it, expect } from 'vitest';
import { apiPrefix, proxyApiPath } from '../proxyPath';

describe('apiPrefix', () => {
  it('returns empty string when no hostId', () => {
    expect(apiPrefix()).toBe('');
    expect(apiPrefix(null)).toBe('');
    expect(apiPrefix(undefined)).toBe('');
  });

  it('returns proxy prefix for a hostId', () => {
    expect(apiPrefix('abc-123')).toBe('/api/hosts/abc-123/proxy');
  });
});

describe('proxyApiPath', () => {
  it('returns path unchanged when no hostId', () => {
    expect(proxyApiPath('/api/jobs')).toBe('/api/jobs');
    expect(proxyApiPath('/api/jobs', null)).toBe('/api/jobs');
  });

  it('strips /api/ prefix and builds proxy path', () => {
    expect(proxyApiPath('/api/jobs', 'host-1')).toBe('/api/hosts/host-1/proxy/jobs');
  });

  it('handles nested API paths', () => {
    expect(proxyApiPath('/api/jobs/123/start', 'host-1')).toBe('/api/hosts/host-1/proxy/jobs/123/start');
  });

  it('handles paths without /api/ prefix', () => {
    expect(proxyApiPath('/other/path', 'host-1')).toBe('/api/hosts/host-1/proxy//other/path');
  });
});
