import { describe, it, expect, vi } from 'vitest';
import { cn, formatDate, formatNumber, copyToClipboard } from '@/lib/utils';

describe('cn', () => {
  it('merges simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('');
  });

  it('handles conditional classes via clsx', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
    expect(cn('base', true && 'active')).toBe('base active');
  });

  it('handles undefined and null inputs', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
  });

  it('handles array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('handles object inputs', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('merges conflicting tailwind classes (last wins)', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    expect(cn('mt-2', 'mt-4')).toBe('mt-4');
  });

  it('preserves non-conflicting tailwind classes', () => {
    expect(cn('p-4', 'mt-2')).toBe('p-4 mt-2');
    expect(cn('text-red-500', 'bg-blue-500')).toBe('text-red-500 bg-blue-500');
  });

  it('handles mixed clsx + tailwind-merge scenarios', () => {
    expect(cn('px-2 py-1', { 'px-4': true, 'bg-red-500': false })).toBe('py-1 px-4');
    expect(cn('rounded', ['shadow', 'rounded-lg'])).toBe('shadow rounded-lg');
  });
});

describe('formatDate', () => {
  it('formats a standard date', () => {
    // Month is 0-indexed, so 0 = January
    const date = new Date(2026, 0, 15);
    expect(formatDate(date)).toBe('Jan 15, 2026');
  });

  it('formats another month correctly', () => {
    const date = new Date(2025, 11, 25);
    expect(formatDate(date)).toBe('Dec 25, 2025');
  });

  it('formats the first day of a month', () => {
    const date = new Date(2024, 2, 1);
    expect(formatDate(date)).toBe('Mar 1, 2024');
  });

  it('formats a leap-year date', () => {
    const date = new Date(2024, 1, 29);
    expect(formatDate(date)).toBe('Feb 29, 2024');
  });

  it('formats dates with single-digit days', () => {
    const date = new Date(2026, 5, 5);
    expect(formatDate(date)).toBe('Jun 5, 2026');
  });

  it('formats end-of-year date', () => {
    const date = new Date(2026, 11, 31);
    expect(formatDate(date)).toBe('Dec 31, 2026');
  });
});

describe('formatNumber', () => {
  it('formats small numbers as-is', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(999)).toBe('999');
  });

  it('formats thousands with K suffix', () => {
    expect(formatNumber(1000)).toBe('1K');
    expect(formatNumber(1500)).toBe('1.5K');
    expect(formatNumber(9999)).toBe('10K');
  });

  it('formats millions with M suffix', () => {
    expect(formatNumber(1_000_000)).toBe('1M');
    expect(formatNumber(2_500_000)).toBe('2.5M');
  });

  it('formats billions with B suffix', () => {
    expect(formatNumber(1_000_000_000)).toBe('1B');
    expect(formatNumber(7_800_000_000)).toBe('7.8B');
  });

  it('respects maximumFractionDigits: 1', () => {
    // 1,550 => 1.6K (rounds to 1 decimal)
    expect(formatNumber(1550)).toBe('1.6K');
    // 1,450 => 1.5K (rounds to 1 decimal, down)
    expect(formatNumber(1450)).toBe('1.5K');
  });

  it('formats negative numbers', () => {
    expect(formatNumber(-1000)).toBe('-1K');
    expect(formatNumber(-2_500_000)).toBe('-2.5M');
  });
});

describe('copyToClipboard', () => {
  it('returns true on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const result = await copyToClipboard('hello');

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const result = await copyToClipboard('secret');

    expect(result).toBe(false);
    expect(writeText).toHaveBeenCalledWith('secret');
  });

  it('handles empty string', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const result = await copyToClipboard('');

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('');
  });

  it('handles long text', async () => {
    const longText = 'a'.repeat(10_000);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const result = await copyToClipboard(longText);

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith(longText);
  });
});
