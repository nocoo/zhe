import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockGetOverviewStats = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    getOverviewStats: mockGetOverviewStats,
  })),
}));

// Suppress console.error noise from catch blocks
vi.spyOn(console, 'error').mockImplementation(() => {});

import { getOverviewStats } from '@/actions/overview';

describe('getOverviewStats action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await getOverviewStats();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error when user id is missing', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const result = await getOverviewStats();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns overview stats on success', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const mockStats = {
      totalLinks: 10,
      totalClicks: 500,
      totalUploads: 5,
      totalStorageBytes: 1048576,
      clickTimestamps: [new Date('2026-02-10'), new Date('2026-02-11')],
      topLinks: [{ slug: 'abc', originalUrl: 'https://example.com', clicks: 100 }],
      deviceBreakdown: { desktop: 300, mobile: 200 },
      browserBreakdown: { Chrome: 400 },
      osBreakdown: { macOS: 300 },
    };
    mockGetOverviewStats.mockResolvedValue(mockStats);

    const result = await getOverviewStats();
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockStats);
  });

  it('returns error when db throws', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetOverviewStats.mockRejectedValue(new Error('DB error'));

    const result = await getOverviewStats();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to get overview stats');
  });
});
