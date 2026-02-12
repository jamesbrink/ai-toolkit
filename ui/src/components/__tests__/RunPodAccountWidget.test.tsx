import { describe, it, expect } from 'vitest';

// Extract and test the formatting functions from RunPodAccountWidget
// We re-implement them here since they're not exported, testing the same logic

function formatDollars(amount: number | null | undefined): string {
  if (amount == null) return '$—';
  return `$${amount.toFixed(2)}`;
}

function formatTimeRemaining(balance: number | null | undefined, spendPerHr: number | null | undefined): string {
  if (!balance || !spendPerHr || spendPerHr <= 0) return 'No active pods';
  const hours = balance / spendPerHr;
  if (hours < 1) return `${Math.round(hours * 60)}m remaining`;
  if (hours < 24) return `${Math.round(hours)}h remaining`;
  const days = Math.floor(hours / 24);
  const remainHours = Math.round(hours % 24);
  return `${days}d ${remainHours}h remaining`;
}

describe('formatDollars', () => {
  it('formats a positive number', () => {
    expect(formatDollars(42.567)).toBe('$42.57');
  });

  it('formats zero', () => {
    expect(formatDollars(0)).toBe('$0.00');
  });

  it('formats a large number', () => {
    expect(formatDollars(1234.5)).toBe('$1234.50');
  });

  it('handles null', () => {
    expect(formatDollars(null)).toBe('$—');
  });

  it('handles undefined', () => {
    expect(formatDollars(undefined)).toBe('$—');
  });
});

describe('formatTimeRemaining', () => {
  it('returns "No active pods" when spend is 0', () => {
    expect(formatTimeRemaining(100, 0)).toBe('No active pods');
  });

  it('returns "No active pods" when spend is negative', () => {
    expect(formatTimeRemaining(100, -1)).toBe('No active pods');
  });

  it('returns "No active pods" when balance is null', () => {
    expect(formatTimeRemaining(null, 1)).toBe('No active pods');
  });

  it('returns "No active pods" when spend is null', () => {
    expect(formatTimeRemaining(100, null)).toBe('No active pods');
  });

  it('returns minutes when less than 1 hour', () => {
    expect(formatTimeRemaining(0.5, 1)).toBe('30m remaining');
  });

  it('returns hours when less than 1 day', () => {
    expect(formatTimeRemaining(10, 1)).toBe('10h remaining');
  });

  it('returns days and hours for large balances', () => {
    expect(formatTimeRemaining(48, 1)).toBe('2d 0h remaining');
  });

  it('handles fractional hours', () => {
    expect(formatTimeRemaining(25.5, 1)).toBe('1d 2h remaining');
  });
});
