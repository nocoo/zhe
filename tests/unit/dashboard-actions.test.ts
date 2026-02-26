import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockGetLinks = vi.fn();
const mockGetTags = vi.fn();
const mockGetLinkTags = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    getLinks: mockGetLinks,
    getTags: mockGetTags,
    getLinkTags: mockGetLinkTags,
  })),
}));

import { getDashboardData } from '@/actions/dashboard';

// ── Tests ──

describe('getDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('returns Unauthorized when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await getDashboardData();
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns links, tags, and linkTags on success', async () => {
    const links = [{ id: 1, slug: 'abc' }];
    const tags = [{ id: 't1', name: 'tag' }];
    const linkTags = [{ linkId: 1, tagId: 't1' }];

    mockGetLinks.mockResolvedValue(links);
    mockGetTags.mockResolvedValue(tags);
    mockGetLinkTags.mockResolvedValue(linkTags);

    const result = await getDashboardData();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ links, tags, linkTags });
  });

  it('calls all three DB methods in parallel', async () => {
    mockGetLinks.mockResolvedValue([]);
    mockGetTags.mockResolvedValue([]);
    mockGetLinkTags.mockResolvedValue([]);

    await getDashboardData();

    expect(mockGetLinks).toHaveBeenCalledOnce();
    expect(mockGetTags).toHaveBeenCalledOnce();
    expect(mockGetLinkTags).toHaveBeenCalledOnce();
  });

  it('returns error when db.getLinks throws', async () => {
    mockGetLinks.mockRejectedValue(new Error('DB down'));
    mockGetTags.mockResolvedValue([]);
    mockGetLinkTags.mockResolvedValue([]);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await getDashboardData();
    spy.mockRestore();

    expect(result).toEqual({ success: false, error: 'Failed to get dashboard data' });
  });

  it('returns error when db.getTags throws', async () => {
    mockGetLinks.mockResolvedValue([]);
    mockGetTags.mockRejectedValue(new Error('DB error'));
    mockGetLinkTags.mockResolvedValue([]);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await getDashboardData();
    spy.mockRestore();

    expect(result).toEqual({ success: false, error: 'Failed to get dashboard data' });
  });

  it('returns empty arrays when DB returns empty', async () => {
    mockGetLinks.mockResolvedValue([]);
    mockGetTags.mockResolvedValue([]);
    mockGetLinkTags.mockResolvedValue([]);

    const result = await getDashboardData();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ links: [], tags: [], linkTags: [] });
  });
});
