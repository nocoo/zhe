import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'test-user', name: 'Test', email: 'test@test.com' },
  }),
}));

const mockGetLinks = vi.fn();
vi.mock('@/actions/links', () => ({
  getLinks: (...args: unknown[]) => mockGetLinks(...args),
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  getAnalyticsStats: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(
    new Map([
      ['x-forwarded-proto', 'https'],
      ['host', 'zhe.to'],
    ])
  ),
}));

describe('Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no links', async () => {
    mockGetLinks.mockResolvedValue({ success: true, data: [] });

    const { default: DashboardPage } = await import(
      '@/app/(dashboard)/dashboard/page'
    );
    const jsx = await DashboardPage();
    render(jsx);

    expect(screen.getByText('Links')).toBeInTheDocument();
    expect(screen.getByText('暂无链接')).toBeInTheDocument();
    expect(screen.getByText('共 0 条链接')).toBeInTheDocument();
  });

  it('renders link cards when links exist', async () => {
    mockGetLinks.mockResolvedValue({
      success: true,
      data: [
        {
          id: 1,
          userId: 'test-user',
          slug: 'abc123',
          originalUrl: 'https://example.com',
          isCustom: false,
          clicks: 42,
          createdAt: new Date('2026-01-01'),
          expiresAt: null,
          folderId: null,
        },
      ],
    });

    const { default: DashboardPage } = await import(
      '@/app/(dashboard)/dashboard/page'
    );
    const jsx = await DashboardPage();
    render(jsx);

    expect(screen.getByText('共 1 条链接')).toBeInTheDocument();
    // The short URL should render (without protocol prefix)
    expect(screen.getByText('zhe.to/abc123')).toBeInTheDocument();
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  it('constructs siteUrl from request headers', async () => {
    mockGetLinks.mockResolvedValue({ success: true, data: [] });

    const { default: DashboardPage } = await import(
      '@/app/(dashboard)/dashboard/page'
    );
    const jsx = await DashboardPage();
    render(jsx);

    // The component passes siteUrl to CreateLinkModal — we verify indirectly
    // by checking the page rendered without error with the mocked headers
    expect(screen.getByText('Links')).toBeInTheDocument();
  });

  it('handles getLinks failure gracefully', async () => {
    mockGetLinks.mockResolvedValue({ success: false, error: 'DB error' });

    const { default: DashboardPage } = await import(
      '@/app/(dashboard)/dashboard/page'
    );
    const jsx = await DashboardPage();
    render(jsx);

    // Falls back to empty array via `result.data ?? []`
    expect(screen.getByText('暂无链接')).toBeInTheDocument();
  });
});
