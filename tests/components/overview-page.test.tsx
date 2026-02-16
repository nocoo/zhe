import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewPage } from '@/components/dashboard/overview-page';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseOverviewViewModel = vi.fn();
vi.mock('@/viewmodels/useOverviewViewModel', () => ({
  useOverviewViewModel: () => mockUseOverviewViewModel(),
}));

// Mock recharts to avoid rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  Legend: () => <div data-testid="legend" />,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
}));

import type { OverviewStats } from '@/models/overview';

function makeStats(overrides: Partial<OverviewStats> = {}): OverviewStats {
  return {
    totalLinks: 10,
    totalClicks: 500,
    totalUploads: 5,
    totalStorageBytes: 1048576,
    clickTrend: [
      { date: '2026-02-10', clicks: 100 },
      { date: '2026-02-11', clicks: 200 },
    ],
    uploadTrend: [
      { date: '2026-02-10', uploads: 2 },
      { date: '2026-02-11', uploads: 3 },
    ],
    topLinks: [
      { slug: 'abc', originalUrl: 'https://example.com', clicks: 100 },
      { slug: 'def', originalUrl: 'https://other.com', clicks: 50 },
    ],
    deviceBreakdown: { desktop: 300, mobile: 200 },
    browserBreakdown: { Chrome: 400, Safari: 100 },
    osBreakdown: { macOS: 300, Windows: 200 },
    fileTypeBreakdown: { 'image/png': 3, 'image/jpeg': 2 },
    ...overrides,
  };
}

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton when loading', () => {
    mockUseOverviewViewModel.mockReturnValue({
      loading: true,
      error: null,
      stats: null,
    });

    render(<OverviewPage />);
    expect(screen.getAllByTestId('stat-skeleton').length).toBeGreaterThan(0);
  });

  it('shows error message when error occurs', () => {
    mockUseOverviewViewModel.mockReturnValue({
      loading: false,
      error: '加载概览数据失败',
      stats: null,
    });

    render(<OverviewPage />);
    expect(screen.getByText('加载概览数据失败')).toBeInTheDocument();
  });

  it('renders stat cards with correct values', () => {
    mockUseOverviewViewModel.mockReturnValue({
      loading: false,
      error: null,
      stats: makeStats(),
    });

    render(<OverviewPage />);

    // Stat card labels
    expect(screen.getByText('总链接数')).toBeInTheDocument();
    expect(screen.getByText('总点击量')).toBeInTheDocument();
    expect(screen.getByText('总上传数')).toBeInTheDocument();
    expect(screen.getByText('存储用量')).toBeInTheDocument();

    // Values
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
  });

  it('renders click trend chart section', () => {
    mockUseOverviewViewModel.mockReturnValue({
      loading: false,
      error: null,
      stats: makeStats(),
    });

    render(<OverviewPage />);
    expect(screen.getByText('点击趋势')).toBeInTheDocument();
  });

  it('renders top links list', () => {
    mockUseOverviewViewModel.mockReturnValue({
      loading: false,
      error: null,
      stats: makeStats(),
    });

    render(<OverviewPage />);
    expect(screen.getByText('热门链接')).toBeInTheDocument();
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
  });

  it('renders device breakdown chart section', () => {
    mockUseOverviewViewModel.mockReturnValue({
      loading: false,
      error: null,
      stats: makeStats(),
    });

    render(<OverviewPage />);
    expect(screen.getByText('设备分布')).toBeInTheDocument();
  });

  it('renders browser breakdown chart section', () => {
    mockUseOverviewViewModel.mockReturnValue({
      loading: false,
      error: null,
      stats: makeStats(),
    });

    render(<OverviewPage />);
    expect(screen.getByText('浏览器分布')).toBeInTheDocument();
  });

  it('renders upload trend chart section', () => {
    mockUseOverviewViewModel.mockReturnValue({
      loading: false,
      error: null,
      stats: makeStats(),
    });

    render(<OverviewPage />);
    expect(screen.getByText('上传趋势')).toBeInTheDocument();
  });

  it('renders file type breakdown chart section', () => {
    mockUseOverviewViewModel.mockReturnValue({
      loading: false,
      error: null,
      stats: makeStats(),
    });

    render(<OverviewPage />);
    expect(screen.getByText('文件类型')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    mockUseOverviewViewModel.mockReturnValue({
      loading: false,
      error: null,
      stats: makeStats({
        totalLinks: 0,
        totalClicks: 0,
        totalUploads: 0,
        totalStorageBytes: 0,
        clickTrend: [],
        uploadTrend: [],
        topLinks: [],
        deviceBreakdown: {},
        browserBreakdown: {},
        osBreakdown: {},
        fileTypeBreakdown: {},
      }),
    });

    render(<OverviewPage />);

    // Multiple stat cards show "0" — verify via stat-card count and getAllByText
    const statCards = screen.getAllByTestId('stat-card');
    expect(statCards.length).toBe(4);
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3); // links, clicks, uploads

    // Empty chart/list states
    expect(screen.getByText('暂无点击数据')).toBeInTheDocument();
    expect(screen.getByText('暂无上传数据')).toBeInTheDocument();
    expect(screen.getByText('暂无链接')).toBeInTheDocument();
    expect(screen.getAllByText('暂无数据').length).toBe(4); // device, browser, os, file type
  });
});
