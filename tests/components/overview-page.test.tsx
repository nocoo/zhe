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

import type { OverviewStats, WorkerHealthStatus } from '@/models/overview';
import type { CronHistoryEntry } from '@/lib/cron-history';

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

function makeEntry(overrides: Partial<CronHistoryEntry> = {}): CronHistoryEntry {
  return {
    timestamp: new Date().toISOString(),
    status: 'success',
    synced: 42,
    failed: 0,
    total: 42,
    durationMs: 150,
    ...overrides,
  };
}

function makeWorkerHealth(overrides: Partial<WorkerHealthStatus> = {}): WorkerHealthStatus {
  return {
    cronHistory: [makeEntry()],
    lastSyncTime: new Date().toISOString(),
    kvKeyCount: 42,
    syncSuccessRate: 100,
    ...overrides,
  };
}

/** Default viewmodel state with worker health loaded */
function vmState(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    error: null,
    stats: makeStats(),
    workerHealth: makeWorkerHealth(),
    workerHealthLoading: false,
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
      workerHealth: null,
      workerHealthLoading: true,
    });

    render(<OverviewPage />);
    expect(screen.getAllByTestId('stat-skeleton').length).toBeGreaterThan(0);
  });

  it('shows error message when error occurs', () => {
    mockUseOverviewViewModel.mockReturnValue({
      loading: false,
      error: '加载概览数据失败',
      stats: null,
      workerHealth: null,
      workerHealthLoading: false,
    });

    render(<OverviewPage />);
    expect(screen.getByText('加载概览数据失败')).toBeInTheDocument();
  });

  it('renders stat cards with correct values', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState());

    render(<OverviewPage />);

    // Section headers
    expect(screen.getByText('链接统计')).toBeInTheDocument();
    expect(screen.getByText('图床统计')).toBeInTheDocument();

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
    mockUseOverviewViewModel.mockReturnValue(vmState());

    render(<OverviewPage />);
    expect(screen.getByText('点击趋势')).toBeInTheDocument();
  });

  it('renders top links list', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState());

    render(<OverviewPage />);
    expect(screen.getByText('热门链接')).toBeInTheDocument();
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
  });

  it('renders device breakdown chart section', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState());

    render(<OverviewPage />);
    expect(screen.getByText('设备分布')).toBeInTheDocument();
  });

  it('renders browser breakdown chart section', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState());

    render(<OverviewPage />);
    expect(screen.getByText('浏览器分布')).toBeInTheDocument();
  });

  it('renders upload trend chart section', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState());

    render(<OverviewPage />);
    expect(screen.getByText('上传趋势')).toBeInTheDocument();
  });

  it('renders file type breakdown chart section', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState());

    render(<OverviewPage />);
    expect(screen.getByText('文件类型')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState({
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
    }));

    render(<OverviewPage />);

    // 4 link/upload stat cards + 3 worker health stat cards = 7 total
    const statCards = screen.getAllByTestId('stat-card');
    expect(statCards.length).toBe(7);
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3); // links, clicks, uploads

    // Empty chart/list states
    expect(screen.getByText('暂无点击数据')).toBeInTheDocument();
    expect(screen.getByText('暂无上传数据')).toBeInTheDocument();
    expect(screen.getByText('暂无链接')).toBeInTheDocument();
    expect(screen.getAllByText('暂无数据').length).toBe(4); // device, browser, os, file type
  });

  // ==================================================================
  // Worker Health section
  // ==================================================================

  it('renders Worker 健康 section header', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState());

    render(<OverviewPage />);
    expect(screen.getByText('Worker 健康')).toBeInTheDocument();
  });

  it('shows Worker health skeletons when loading', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState({
      workerHealth: null,
      workerHealthLoading: true,
    }));

    render(<OverviewPage />);
    expect(screen.getByText('Worker 健康')).toBeInTheDocument();
    // Worker health section contributes 3 skeletons
    expect(screen.getAllByTestId('stat-skeleton').length).toBe(3);
  });

  it('shows fallback when worker health is null', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState({
      workerHealth: null,
      workerHealthLoading: false,
    }));

    render(<OverviewPage />);
    expect(screen.getByText('无法加载 Worker 状态')).toBeInTheDocument();
  });

  it('renders worker health stat cards', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState({
      workerHealth: makeWorkerHealth({
        kvKeyCount: 99,
        syncSuccessRate: 95,
      }),
    }));

    render(<OverviewPage />);

    expect(screen.getByText('最近同步')).toBeInTheDocument();
    expect(screen.getByText('KV 键数')).toBeInTheDocument();
    expect(screen.getByText('同步成功率')).toBeInTheDocument();
    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('renders worker health with null values as dashes', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState({
      workerHealth: makeWorkerHealth({
        cronHistory: [],
        lastSyncTime: null,
        kvKeyCount: null,
        syncSuccessRate: null,
      }),
    }));

    render(<OverviewPage />);

    expect(screen.getByText('暂无')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBe(2); // kvKeyCount + syncSuccessRate
  });

  it('renders cron history table with entries', () => {
    const entries = [
      makeEntry({ status: 'success', synced: 50, failed: 0, durationMs: 120 }),
      makeEntry({ status: 'error', synced: 0, failed: 1, durationMs: 5000, error: 'D1 timeout' }),
    ];
    mockUseOverviewViewModel.mockReturnValue(vmState({
      workerHealth: makeWorkerHealth({ cronHistory: entries }),
    }));

    render(<OverviewPage />);

    expect(screen.getByText('同步记录')).toBeInTheDocument();
    expect(screen.getByTestId('cron-history-table')).toBeInTheDocument();
    expect(screen.getByText('成功')).toBeInTheDocument();
    // "失败" appears as both a table header and a status badge
    expect(screen.getAllByText('失败').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('120ms')).toBeInTheDocument();
    expect(screen.getByText('5000ms')).toBeInTheDocument();
  });

  it('shows empty cron history message', () => {
    mockUseOverviewViewModel.mockReturnValue(vmState({
      workerHealth: makeWorkerHealth({ cronHistory: [] }),
    }));

    render(<OverviewPage />);
    expect(screen.getByText('暂无同步记录')).toBeInTheDocument();
  });
});
