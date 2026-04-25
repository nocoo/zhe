// @vitest-environment node
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
  ScopedDB: vi.fn().mockImplementation(function () {
    return {
      getLinks: mockGetLinks,
      getTags: mockGetTags,
      getLinkTags: mockGetLinkTags,
    };
  }),
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
    // Use deferred promises so we can observe whether all three calls are
    // dispatched before any resolves. If the implementation switched to
    // serial `await`, the second/third mocks would not be called until the
    // first resolves — so the snapshot of call counts taken before
    // resolving would catch the regression.
    type Deferred = { promise: Promise<unknown[]>; resolve: (v: unknown[]) => void };
    const defer = (): Deferred => {
      let resolve!: (v: unknown[]) => void;
      const promise = new Promise<unknown[]>((r) => { resolve = r; });
      return { promise, resolve };
    };
    const linksDeferred = defer();
    const tagsDeferred = defer();
    const linkTagsDeferred = defer();

    mockGetLinks.mockReturnValue(linksDeferred.promise);
    mockGetTags.mockReturnValue(tagsDeferred.promise);
    mockGetLinkTags.mockReturnValue(linkTagsDeferred.promise);

    const resultPromise = getDashboardData();

    // Yield to the microtask queue so the action can dispatch all three
    // calls via Promise.all before any resolves.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockGetLinks).toHaveBeenCalledOnce();
    expect(mockGetTags).toHaveBeenCalledOnce();
    expect(mockGetLinkTags).toHaveBeenCalledOnce();

    // Resolve out of order to confirm the action does not depend on
    // sequential ordering.
    linkTagsDeferred.resolve([]);
    tagsDeferred.resolve([]);
    linksDeferred.resolve([]);

    const result = await resultPromise;
    expect(result.success).toBe(true);
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