import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { StoragePage } from '@/components/dashboard/storage-page';
import type { StorageScanResult } from '@/models/storage';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockScanStorage = vi.fn();
const mockCleanupOrphanFiles = vi.fn();

vi.mock('@/actions/storage', () => ({
  scanStorage: (...args: unknown[]) => mockScanStorage(...args),
  cleanupOrphanFiles: (...args: unknown[]) => mockCleanupOrphanFiles(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeTestData(overrides?: Partial<StorageScanResult>): StorageScanResult {
  return {
    d1: {
      connected: true,
      totalLinks: 42,
      totalUploads: 10,
      totalAnalytics: 100,
      tables: [
        { name: 'links', rows: 42 },
        { name: 'uploads', rows: 10 },
      ],
      ...overrides?.d1,
    },
    r2: {
      connected: true,
      summary: {
        totalFiles: 3,
        totalSize: 3072,
        orphanFiles: 1,
        orphanSize: 1024,
      },
      files: [
        {
          key: 'user/20260101/photo.jpg',
          size: 1024,
          lastModified: '2026-01-01T00:00:00Z',
          isReferenced: true,
          publicUrl: 'https://s.zhe.to/user/20260101/photo.jpg',
        },
        {
          key: 'user/20260102/doc.pdf',
          size: 1024,
          lastModified: '2026-01-02T00:00:00Z',
          isReferenced: true,
          publicUrl: 'https://s.zhe.to/user/20260102/doc.pdf',
        },
        {
          key: 'user/20260103/orphan.png',
          size: 1024,
          lastModified: '2026-01-03T00:00:00Z',
          isReferenced: false,
          publicUrl: 'https://s.zhe.to/user/20260103/orphan.png',
        },
      ],
      ...overrides?.r2,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StoragePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering with initialData ──

  it('renders summary cards with initialData', () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    // R2 storage card
    expect(screen.getByText('R2 总存储')).toBeInTheDocument();
    expect(screen.getByText('3 个文件')).toBeInTheDocument();

    // D1 card
    expect(screen.getByText('D1 数据库')).toBeInTheDocument();
    expect(screen.getByText('已连接')).toBeInTheDocument();

    // Orphan card
    expect(screen.getByText('孤儿文件')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    // Status card
    expect(screen.getByText('发现孤儿文件')).toBeInTheDocument();
  });

  it('renders D1 tables when connected', () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    expect(screen.getByText('Cloudflare D1')).toBeInTheDocument();
    expect(screen.getByText('links')).toBeInTheDocument();
    expect(screen.getByText('uploads')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders D1 disconnected badge when not connected', () => {
    const data = makeTestData({
      d1: {
        connected: false,
        totalLinks: 0,
        totalUploads: 0,
        totalAnalytics: 0,
        tables: [],
      },
    });
    render(<StoragePage initialData={data} />);

    expect(screen.getByText('disconnected')).toBeInTheDocument();
  });

  it('renders R2 files list with orphan and linked badges', () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    expect(screen.getByText('Cloudflare R2')).toBeInTheDocument();
    // File names
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
    expect(screen.getByText('orphan.png')).toBeInTheDocument();
    // Badges
    expect(screen.getByText('orphan')).toBeInTheDocument();
    // "linked" badges — there are 2 linked files
    expect(screen.getAllByText('linked')).toHaveLength(2);
  });

  it('renders "一切正常" when no orphans', () => {
    const data = makeTestData({
      r2: {
        connected: true,
        summary: { totalFiles: 2, totalSize: 2048, orphanFiles: 0, orphanSize: 0 },
        files: [
          {
            key: 'user/20260101/photo.jpg',
            size: 1024,
            lastModified: '2026-01-01T00:00:00Z',
            isReferenced: true,
            publicUrl: 'https://s.zhe.to/user/20260101/photo.jpg',
          },
          {
            key: 'user/20260102/doc.pdf',
            size: 1024,
            lastModified: '2026-01-02T00:00:00Z',
            isReferenced: true,
            publicUrl: 'https://s.zhe.to/user/20260102/doc.pdf',
          },
        ],
      },
    });
    render(<StoragePage initialData={data} />);

    expect(screen.getByText('一切正常')).toBeInTheDocument();
    expect(screen.getByText('全部干净')).toBeInTheDocument();
  });

  it('renders empty R2 message when no files', () => {
    const data = makeTestData({
      r2: {
        connected: true,
        summary: { totalFiles: 0, totalSize: 0, orphanFiles: 0, orphanSize: 0 },
        files: [],
      },
    });
    render(<StoragePage initialData={data} />);

    expect(screen.getByText('R2 存储为空')).toBeInTheDocument();
  });

  it('renders R2 disconnected badge when not connected', () => {
    const data = makeTestData({
      r2: {
        connected: false,
        summary: { totalFiles: 0, totalSize: 0, orphanFiles: 0, orphanSize: 0 },
        files: [],
      },
    });
    render(<StoragePage initialData={data} />);

    // Both D1 and R2 headings
    expect(screen.getByText('Cloudflare R2')).toBeInTheDocument();
    // The R2 section should not show file list when disconnected
    expect(screen.queryByText('R2 存储为空')).not.toBeInTheDocument();
  });

  // ── Loading without initialData ──

  it('shows skeleton and fetches data when no initialData', async () => {
    const data = makeTestData();
    mockScanStorage.mockResolvedValueOnce({ success: true, data });

    render(<StoragePage />);

    // Should show skeleton initially (animated pulse elements)
    expect(screen.queryByText('R2 总存储')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('R2 总存储')).toBeInTheDocument();
    });

    expect(mockScanStorage).toHaveBeenCalledOnce();
  });

  it('shows error toast when scan fails', async () => {
    const { toast } = await import('sonner');
    mockScanStorage.mockResolvedValueOnce({ success: false, error: '权限不足' });

    render(<StoragePage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('权限不足');
    });
  });

  it('shows fallback error toast when scan fails without error message', async () => {
    const { toast } = await import('sonner');
    mockScanStorage.mockResolvedValueOnce({ success: false });

    render(<StoragePage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('扫描存储失败');
    });
  });

  it('shows error toast when scan throws', async () => {
    const { toast } = await import('sonner');
    mockScanStorage.mockRejectedValueOnce(new Error('Network error'));

    render(<StoragePage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('扫描存储失败');
    });
  });

  // ── Rescan ──

  it('rescans when rescan button is clicked', async () => {
    const data = makeTestData();
    mockScanStorage.mockResolvedValue({ success: true, data });

    render(<StoragePage initialData={data} />);

    await act(async () => {
      fireEvent.click(screen.getByText('重新扫描'));
    });

    await waitFor(() => {
      expect(mockScanStorage).toHaveBeenCalledOnce();
    });
  });

  // ── Selection & cleanup ──

  it('selects all orphans when "选择全部孤儿文件" is clicked', async () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    await act(async () => {
      fireEvent.click(screen.getByText('选择全部孤儿文件'));
    });

    // Should show selection count
    expect(screen.getByText(/已选 1 个文件/)).toBeInTheDocument();
    // Delete button should appear
    expect(screen.getByText('删除选中')).toBeInTheDocument();
  });

  it('clears selection when "清除选择" is clicked', async () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    // Select all orphans first
    await act(async () => {
      fireEvent.click(screen.getByText('选择全部孤儿文件'));
    });
    expect(screen.getByText(/已选 1 个文件/)).toBeInTheDocument();

    // Clear selection
    await act(async () => {
      fireEvent.click(screen.getByText('清除选择'));
    });

    expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
  });

  it('toggles individual orphan file selection via checkbox', async () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    // The orphan file should have a checkbox
    const checkbox = screen.getByRole('checkbox', { name: /Select orphan.png/ });

    await act(async () => {
      fireEvent.click(checkbox);
    });

    expect(screen.getByText(/已选 1 个文件/)).toBeInTheDocument();

    // Toggle off
    await act(async () => {
      fireEvent.click(checkbox);
    });

    expect(screen.queryByText(/已选/)).not.toBeInTheDocument();
  });

  it('shows confirmation dialog when delete button is clicked', async () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    // Select orphans
    await act(async () => {
      fireEvent.click(screen.getByText('选择全部孤儿文件'));
    });

    // Click delete
    await act(async () => {
      fireEvent.click(screen.getByText('删除选中'));
    });

    // Confirmation dialog should appear
    expect(screen.getByText('删除孤儿文件？')).toBeInTheDocument();
    expect(screen.getByText(/即将从 R2 永久删除 1 个文件/)).toBeInTheDocument();
  });

  it('cancels deletion when cancel button is clicked in dialog', async () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    await act(async () => {
      fireEvent.click(screen.getByText('选择全部孤儿文件'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('删除选中'));
    });

    // Cancel
    await act(async () => {
      fireEvent.click(screen.getByText('取消'));
    });

    // Dialog should close, selection should remain
    expect(screen.queryByText('删除孤儿文件？')).not.toBeInTheDocument();
    expect(screen.getByText(/已选 1 个文件/)).toBeInTheDocument();
  });

  it('performs cleanup when confirmed', async () => {
    const { toast } = await import('sonner');
    const data = makeTestData();
    mockCleanupOrphanFiles.mockResolvedValueOnce({
      success: true,
      data: { deleted: 1, skipped: 0, deletedKeys: ['user/20260103/orphan.png'] },
    });

    render(<StoragePage initialData={data} />);

    // Select orphans
    await act(async () => {
      fireEvent.click(screen.getByText('选择全部孤儿文件'));
    });

    // Click delete
    await act(async () => {
      fireEvent.click(screen.getByText('删除选中'));
    });

    // Confirm
    await act(async () => {
      fireEvent.click(screen.getByText('删除 1 个文件'));
    });

    await waitFor(() => {
      expect(mockCleanupOrphanFiles).toHaveBeenCalledWith([
        'user/20260103/orphan.png',
      ]);
    });

    expect(toast.success).toHaveBeenCalledWith('已删除 1 个文件');

    // Orphan file should be removed from the list
    expect(screen.queryByText('orphan.png')).not.toBeInTheDocument();
  });

  it('shows skipped count in success message', async () => {
    const { toast } = await import('sonner');
    const data = makeTestData();
    mockCleanupOrphanFiles.mockResolvedValueOnce({
      success: true,
      data: { deleted: 0, skipped: 1, deletedKeys: [] },
    });

    render(<StoragePage initialData={data} />);

    await act(async () => {
      fireEvent.click(screen.getByText('选择全部孤儿文件'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('删除选中'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('删除 1 个文件'));
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        '已删除 0 个文件 (1 个已跳过)',
      );
    });
  });

  it('shows error toast when cleanup fails', async () => {
    const { toast } = await import('sonner');
    const data = makeTestData();
    mockCleanupOrphanFiles.mockResolvedValueOnce({
      success: false,
      error: '清理失败了',
    });

    render(<StoragePage initialData={data} />);

    await act(async () => {
      fireEvent.click(screen.getByText('选择全部孤儿文件'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('删除选中'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('删除 1 个文件'));
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('清理失败了');
    });
  });

  it('shows fallback error toast when cleanup fails without message', async () => {
    const { toast } = await import('sonner');
    const data = makeTestData();
    mockCleanupOrphanFiles.mockResolvedValueOnce({ success: false });

    render(<StoragePage initialData={data} />);

    await act(async () => {
      fireEvent.click(screen.getByText('选择全部孤儿文件'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('删除选中'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('删除 1 个文件'));
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('清理失败');
    });
  });

  it('shows error toast when cleanup throws', async () => {
    const { toast } = await import('sonner');
    const data = makeTestData();
    mockCleanupOrphanFiles.mockRejectedValueOnce(new Error('Network'));

    render(<StoragePage initialData={data} />);

    await act(async () => {
      fireEvent.click(screen.getByText('选择全部孤儿文件'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('删除选中'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('删除 1 个文件'));
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('清理孤儿文件失败');
    });
  });

  // ── Sort controls ──

  it('sorts by size when size sort button clicked', async () => {
    const data = makeTestData({
      r2: {
        connected: true,
        summary: { totalFiles: 2, totalSize: 3072, orphanFiles: 0, orphanSize: 0 },
        files: [
          {
            key: 'user/small.txt',
            size: 100,
            lastModified: '2026-01-01T00:00:00Z',
            isReferenced: true,
            publicUrl: 'https://s.zhe.to/user/small.txt',
          },
          {
            key: 'user/big.txt',
            size: 999999,
            lastModified: '2026-01-02T00:00:00Z',
            isReferenced: true,
            publicUrl: 'https://s.zhe.to/user/big.txt',
          },
        ],
      },
    });
    render(<StoragePage initialData={data} />);

    // Click size sort button
    await act(async () => {
      fireEvent.click(screen.getByText('大小'));
    });

    // Files should be rendered (both should exist)
    expect(screen.getByText('small.txt')).toBeInTheDocument();
    expect(screen.getByText('big.txt')).toBeInTheDocument();
  });

  it('toggles sort direction on same field click', async () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    // Click time sort button (already active, should toggle direction)
    const timeBtn = screen.getByText('时间');
    await act(async () => {
      fireEvent.click(timeBtn);
    });

    // Click again to toggle back
    await act(async () => {
      fireEvent.click(timeBtn);
    });

    // Files still render
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  // ── File icons and thumbnails ──

  it('renders image thumbnail for image files with publicUrl', () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    // photo.jpg is an image and is referenced, so it shows an img tag
    const img = screen.getByAltText('photo.jpg');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://s.zhe.to/user/20260101/photo.jpg');
  });

  it('renders file icon for non-image files', () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    // doc.pdf should not have an img tag
    expect(screen.queryByAltText('doc.pdf')).not.toBeInTheDocument();
  });

  it('renders external links for files', () => {
    const data = makeTestData();
    render(<StoragePage initialData={data} />);

    // Each file should have an external link
    const links = screen.getAllByRole('link');
    const r2Links = links.filter((l) =>
      l.getAttribute('href')?.startsWith('https://s.zhe.to/'),
    );
    expect(r2Links).toHaveLength(3);
  });

  // ── No orphan select button when no orphans ──

  it('does not show select all orphans button when no orphans', () => {
    const data = makeTestData({
      r2: {
        connected: true,
        summary: { totalFiles: 1, totalSize: 1024, orphanFiles: 0, orphanSize: 0 },
        files: [
          {
            key: 'user/file.txt',
            size: 1024,
            lastModified: '2026-01-01T00:00:00Z',
            isReferenced: true,
            publicUrl: 'https://s.zhe.to/user/file.txt',
          },
        ],
      },
    });
    render(<StoragePage initialData={data} />);

    expect(screen.queryByText('选择全部孤儿文件')).not.toBeInTheDocument();
  });

  // ── Returns null when loading done but no data ──

  it('returns null when not loading and no data', async () => {
    mockScanStorage.mockResolvedValueOnce({ success: false, error: 'fail' });

    const { container } = render(<StoragePage />);

    await waitFor(() => {
      expect(mockScanStorage).toHaveBeenCalled();
    });

    // After load fail, nothing should render (null)
    await waitFor(() => {
      // The component should render nothing meaningful
      expect(container.querySelector('.space-y-6')).not.toBeInTheDocument();
    });
  });
});
