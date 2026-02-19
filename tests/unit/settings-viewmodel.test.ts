import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DashboardService } from '@/contexts/dashboard-service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockImportLinks = vi.fn();
const mockExportLinks = vi.fn();
const mockUpdatePreviewStyle = vi.fn();
vi.mock('@/actions/settings', () => ({
  importLinks: (...args: unknown[]) => mockImportLinks(...args),
  exportLinks: (...args: unknown[]) => mockExportLinks(...args),
  updatePreviewStyle: (...args: unknown[]) => mockUpdatePreviewStyle(...args),
}));

const mockService: DashboardService = {
  links: [],
  folders: [],
  tags: [],
  linkTags: [],
  loading: false,
  siteUrl: 'http://localhost:3000',
  previewStyle: 'favicon' as const,
  handleLinkCreated: vi.fn(),
  handleLinkDeleted: vi.fn(),
  handleLinkUpdated: vi.fn(),
  refreshLinks: vi.fn().mockResolvedValue(undefined),
  handleFolderCreated: vi.fn(),
  handleFolderDeleted: vi.fn(),
  handleFolderUpdated: vi.fn(),
  handleTagCreated: vi.fn(),
  handleTagDeleted: vi.fn(),
  handleTagUpdated: vi.fn(),
  handleLinkTagAdded: vi.fn(),
  handleLinkTagRemoved: vi.fn(),
  setPreviewStyle: vi.fn(),
};

vi.mock('@/contexts/dashboard-service', () => ({
  useDashboardService: () => mockService,
}));

// Import after mocks
import { useSettingsViewModel } from '@/viewmodels/useSettingsViewModel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock file with a working text() method (jsdom File lacks it) */
function makeFile(content: string, name = 'links.json'): File {
  const file = new File([content], name, { type: 'application/json' });
  file.text = () => Promise.resolve(content);
  return file;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSettingsViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', vi.fn());
    mockService.links = [];
    mockService.previewStyle = 'favicon';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ====================================================================
  // Initial state
  // ====================================================================
  it('returns initial state', () => {
    const { result } = renderHook(() => useSettingsViewModel());

    expect(result.current.isExporting).toBe(false);
    expect(result.current.isImporting).toBe(false);
    expect(result.current.importResult).toBeNull();
  });

  // ====================================================================
  // handleExport
  // ====================================================================
  it('handleExport calls exportLinks and triggers download', async () => {
    const mockUrl = 'blob:http://localhost/fake';
    const mockCreateObjectURL = vi.fn().mockReturnValue(mockUrl);
    const mockRevokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL });

    const mockClick = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const el = origCreateElement('a');
        el.click = mockClick;
        return el;
      }
      return origCreateElement(tag);
    });

    mockExportLinks.mockResolvedValue({
      success: true,
      data: [
        { originalUrl: 'https://example.com', slug: 'test', isCustom: false, clicks: 5, createdAt: '2026-01-15T00:00:00.000Z' },
      ],
    });

    const { result } = renderHook(() => useSettingsViewModel());

    await act(async () => {
      await result.current.handleExport();
    });

    expect(mockExportLinks).toHaveBeenCalled();
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(mockUrl);
    expect(result.current.isExporting).toBe(false);
  });

  it('handleExport shows alert on failure', async () => {
    mockExportLinks.mockResolvedValue({ success: false, error: 'Unauthorized' });

    const { result } = renderHook(() => useSettingsViewModel());

    await act(async () => {
      await result.current.handleExport();
    });

    expect(globalThis.alert).toHaveBeenCalledWith('Unauthorized');
    expect(result.current.isExporting).toBe(false);
  });

  it('handleExport shows default error when error is empty', async () => {
    mockExportLinks.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useSettingsViewModel());

    await act(async () => {
      await result.current.handleExport();
    });

    expect(globalThis.alert).toHaveBeenCalledWith('导出失败');
  });

  // ====================================================================
  // handleImport
  // ====================================================================
  it('handleImport parses file and calls importLinks', async () => {
    const fileContent = JSON.stringify([
      { originalUrl: 'https://example.com', slug: 'test', isCustom: false, clicks: 0, createdAt: '2026-01-01' },
    ]);
    const file = makeFile(fileContent);

    mockImportLinks.mockResolvedValue({ success: true, data: { created: 1, skipped: 0 } });

    const { result } = renderHook(() => useSettingsViewModel());

    await act(async () => {
      await result.current.handleImport(file);
    });

    expect(mockImportLinks).toHaveBeenCalled();
    expect(result.current.importResult).toEqual({ created: 1, skipped: 0 });
    expect(result.current.isImporting).toBe(false);
  });

  it('handleImport shows alert on invalid JSON', async () => {
    const file = makeFile('not json');

    const { result } = renderHook(() => useSettingsViewModel());

    await act(async () => {
      await result.current.handleImport(file);
    });

    expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('JSON'));
    expect(mockImportLinks).not.toHaveBeenCalled();
  });

  it('handleImport shows alert on server error', async () => {
    const fileContent = JSON.stringify([
      { originalUrl: 'https://example.com', slug: 'test', isCustom: false, clicks: 0, createdAt: '2026-01-01' },
    ]);
    const file = makeFile(fileContent);

    mockImportLinks.mockResolvedValue({ success: false, error: 'DB error' });

    const { result } = renderHook(() => useSettingsViewModel());

    await act(async () => {
      await result.current.handleImport(file);
    });

    expect(globalThis.alert).toHaveBeenCalledWith('DB error');
    expect(result.current.importResult).toBeNull();
  });

  it('handleImport shows default error when error is empty', async () => {
    const fileContent = JSON.stringify([
      { originalUrl: 'https://example.com', slug: 'test', isCustom: false, clicks: 0, createdAt: '2026-01-01' },
    ]);
    const file = makeFile(fileContent);

    mockImportLinks.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useSettingsViewModel());

    await act(async () => {
      await result.current.handleImport(file);
    });

    expect(globalThis.alert).toHaveBeenCalledWith('导入失败');
  });

  it('clearImportResult resets importResult', async () => {
    const fileContent = JSON.stringify([
      { originalUrl: 'https://example.com', slug: 'test', isCustom: false, clicks: 0, createdAt: '2026-01-01' },
    ]);
    const file = makeFile(fileContent);
    mockImportLinks.mockResolvedValue({ success: true, data: { created: 1, skipped: 0 } });

    const { result } = renderHook(() => useSettingsViewModel());

    await act(async () => {
      await result.current.handleImport(file);
    });
    expect(result.current.importResult).not.toBeNull();

    act(() => {
      result.current.clearImportResult();
    });
    expect(result.current.importResult).toBeNull();
  });

  // ====================================================================
  // previewStyle
  // ====================================================================
  it('exposes previewStyle from dashboard service context', () => {
    mockService.previewStyle = 'screenshot';
    const { result } = renderHook(() => useSettingsViewModel());

    expect(result.current.previewStyle).toBe('screenshot');
  });

  it('exposes default previewStyle as favicon', () => {
    const { result } = renderHook(() => useSettingsViewModel());

    expect(result.current.previewStyle).toBe('favicon');
  });

  it('handlePreviewStyleChange optimistically updates and calls server action', async () => {
    mockUpdatePreviewStyle.mockResolvedValue({ success: true, data: 'screenshot' });

    const { result } = renderHook(() => useSettingsViewModel());

    await act(async () => {
      await result.current.handlePreviewStyleChange('screenshot');
    });

    expect(mockService.setPreviewStyle).toHaveBeenCalledWith('screenshot');
    expect(mockUpdatePreviewStyle).toHaveBeenCalledWith('screenshot');
  });

  it('handlePreviewStyleChange rolls back on server failure', async () => {
    mockService.previewStyle = 'favicon';
    mockUpdatePreviewStyle.mockResolvedValue({ success: false, error: 'DB error' });

    const { result } = renderHook(() => useSettingsViewModel());

    await act(async () => {
      await result.current.handlePreviewStyleChange('screenshot');
    });

    // First call: optimistic update to 'screenshot'
    // Second call: rollback to 'favicon'
    expect(mockService.setPreviewStyle).toHaveBeenCalledTimes(2);
    expect(mockService.setPreviewStyle).toHaveBeenNthCalledWith(1, 'screenshot');
    expect(mockService.setPreviewStyle).toHaveBeenNthCalledWith(2, 'favicon');
  });

  it('handlePreviewStyleChange does not rollback on success', async () => {
    mockUpdatePreviewStyle.mockResolvedValue({ success: true, data: 'screenshot' });

    const { result } = renderHook(() => useSettingsViewModel());

    await act(async () => {
      await result.current.handlePreviewStyleChange('screenshot');
    });

    // Only one call: optimistic update
    expect(mockService.setPreviewStyle).toHaveBeenCalledTimes(1);
    expect(mockService.setPreviewStyle).toHaveBeenCalledWith('screenshot');
  });
});
