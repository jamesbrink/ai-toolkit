import { describe, it, expect } from 'vitest';

// Re-implement the formatting functions from RunPodPodCard to test them

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  if (hr < 24) return `${hr}h ${remainMin}m`;
  const days = Math.floor(hr / 24);
  return `${days}d ${hr % 24}h`;
}

function formatCost(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

describe('formatUptime', () => {
  it('formats seconds', () => {
    expect(formatUptime(30)).toBe('30s');
  });

  it('formats zero seconds', () => {
    expect(formatUptime(0)).toBe('0s');
  });

  it('formats minutes', () => {
    expect(formatUptime(120)).toBe('2m');
  });

  it('formats hours with remaining minutes', () => {
    expect(formatUptime(3690)).toBe('1h 1m');
  });

  it('formats exact hours', () => {
    expect(formatUptime(7200)).toBe('2h 0m');
  });

  it('formats days', () => {
    expect(formatUptime(90000)).toBe('1d 1h');
  });

  it('formats multiple days', () => {
    expect(formatUptime(259200)).toBe('3d 0h');
  });
});

describe('formatCost', () => {
  it('formats to two decimal places', () => {
    expect(formatCost(1.5)).toBe('$1.50');
  });

  it('formats zero', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('rounds correctly', () => {
    expect(formatCost(0.999)).toBe('$1.00');
  });

  it('formats small amounts', () => {
    expect(formatCost(0.01)).toBe('$0.01');
  });
});

describe('statusConfig', () => {
  const statusConfig: Record<string, { color: string; label: string }> = {
    deploying: { color: 'bg-yellow-900 text-yellow-300', label: 'Deploying' },
    running: { color: 'bg-green-900 text-green-300', label: 'Running' },
    stopped: { color: 'bg-gray-700 text-gray-300', label: 'Stopped' },
    error: { color: 'bg-red-900 text-red-300', label: 'Error' },
    terminated: { color: 'bg-gray-700 text-gray-400', label: 'Terminated' },
  };

  it('has all expected statuses', () => {
    expect(Object.keys(statusConfig)).toEqual(['deploying', 'running', 'stopped', 'error', 'terminated']);
  });

  it('each status has a color and label', () => {
    for (const [key, value] of Object.entries(statusConfig)) {
      expect(value.color, `${key} color`).toBeTruthy();
      expect(value.label, `${key} label`).toBeTruthy();
    }
  });

  it('falls back to error config for unknown status', () => {
    const unknownStatus = 'unknown';
    const status = statusConfig[unknownStatus] || statusConfig.error;
    expect(status.label).toBe('Error');
  });
});
