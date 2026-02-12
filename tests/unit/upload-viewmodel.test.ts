import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Upload } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetPresignedUploadUrl = vi.fn();
const mockRecordUpload = vi.fn();
const mockFetchUploads = vi.fn();
const mockDeleteUploadAction = vi.fn();

vi.mock('@/actions/upload', () => ({
  getPresignedUploadUrl: (...args: unknown[]) => mockGetPresignedUploadUrl(...args),
  recordUpload: (...args: unknown[]) => mockRecordUpload(...args),
  getUploads: (...args: unknown[]) => mockFetchUploads(...args),
  deleteUpload: (...args: unknown[]) => mockDeleteUploadAction(...args),
}));

vi.mock('@/models/upload', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/models/upload')>();
  return {
    ...original,
    // Keep real implementations for pure functions
    validateUploadRequest: original.validateUploadRequest,
    formatFileSize: original.formatFileSize,
    isImageType: original.isImageType,
  };
});

const mockCopyToClipboard = vi.fn();
vi.mock('@/lib/utils', () => ({
  copyToClipboard: (...args: unknown[]) => mockCopyToClipboard(...args),
  cn: (...inputs: string[]) => inputs.join(' '),
  formatDate: (d: Date) => d.toISOString(),
  formatNumber: (n: number) => String(n),
}));

// Import after mocks
import {
  useUploadsViewModel,
  useUploadItemViewModel,
} from '@/viewmodels/useUploadViewModel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUpload(overrides: Partial<Upload> = {}): Upload {
  return {
    id: 1,
    userId: 'user-1',
    key: '20260212/abc-def.png',
    fileName: 'photo.png',
    fileType: 'image/png',
    fileSize: 1024,
    publicUrl: 'https://s.zhe.to/20260212/abc-def.png',
    createdAt: new Date('2026-02-12'),
    ...overrides,
  };
}

function makeFile(name = 'photo.png', type = 'image/png', size = 1024): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

// Mock global fetch
const mockFetch = vi.fn();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useUploadsViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Mock global fetch for R2 PUT
    vi.stubGlobal('fetch', mockFetch);
    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: () => 'mock-uuid-1234',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns initial state with provided uploads', () => {
    const uploads = [makeUpload({ id: 1 }), makeUpload({ id: 2 })];
    const { result } = renderHook(() => useUploadsViewModel(uploads));

    expect(result.current.uploads).toEqual(uploads);
    expect(result.current.uploadingFiles).toEqual([]);
    expect(result.current.isDragOver).toBe(false);
  });

  it('setIsDragOver toggles drag state', () => {
    const { result } = renderHook(() => useUploadsViewModel([]));

    act(() => {
      result.current.setIsDragOver(true);
    });
    expect(result.current.isDragOver).toBe(true);

    act(() => {
      result.current.setIsDragOver(false);
    });
    expect(result.current.isDragOver).toBe(false);
  });

  describe('handleFiles — full upload flow', () => {
    it('validates, gets presigned URL, PUTs to R2, records in DB on success', async () => {
      const upload = makeUpload({ id: 42 });
      mockGetPresignedUploadUrl.mockResolvedValue({
        success: true,
        data: {
          uploadUrl: 'https://r2.example.com/presigned',
          publicUrl: 'https://s.zhe.to/20260212/uuid.png',
          key: '20260212/uuid.png',
        },
      });
      mockFetch.mockResolvedValue({ ok: true });
      mockRecordUpload.mockResolvedValue({ success: true, data: upload });

      const { result } = renderHook(() => useUploadsViewModel([]));

      await act(async () => {
        result.current.handleFiles([makeFile()]);
        // Let all promises resolve
        await vi.runAllTimersAsync();
      });

      // Presigned URL was requested
      expect(mockGetPresignedUploadUrl).toHaveBeenCalledWith({
        fileName: 'photo.png',
        fileType: 'image/png',
        fileSize: 1024,
      });

      // File was PUT to R2
      expect(mockFetch).toHaveBeenCalledWith(
        'https://r2.example.com/presigned',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
        }),
      );

      // Upload was recorded in DB
      expect(mockRecordUpload).toHaveBeenCalledWith({
        key: '20260212/uuid.png',
        fileName: 'photo.png',
        fileType: 'image/png',
        fileSize: 1024,
        publicUrl: 'https://s.zhe.to/20260212/uuid.png',
      });

      // Upload was added to the list
      expect(result.current.uploads).toEqual([upload]);
    });

    it('shows error when file type is not allowed', async () => {
      const { result } = renderHook(() => useUploadsViewModel([]));

      await act(async () => {
        result.current.handleFiles([makeFile('virus.exe', 'application/x-msdownload', 100)]);
        await vi.runAllTimersAsync();
      });

      // Should NOT call presigned URL
      expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('shows error when file size exceeds limit', async () => {
      const { result } = renderHook(() => useUploadsViewModel([]));

      await act(async () => {
        // 11MB file
        result.current.handleFiles([makeFile('huge.png', 'image/png', 11 * 1024 * 1024)]);
        await vi.runAllTimersAsync();
      });

      expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('shows error when presigned URL request fails', async () => {
      mockGetPresignedUploadUrl.mockResolvedValue({
        success: false,
        error: 'R2 error',
      });

      const { result } = renderHook(() => useUploadsViewModel([]));

      await act(async () => {
        result.current.handleFiles([makeFile()]);
        await vi.runAllTimersAsync();
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockRecordUpload).not.toHaveBeenCalled();
      expect(result.current.uploads).toEqual([]);
    });

    it('shows error when R2 PUT fails', async () => {
      mockGetPresignedUploadUrl.mockResolvedValue({
        success: true,
        data: {
          uploadUrl: 'https://r2.example.com/presigned',
          publicUrl: 'https://s.zhe.to/20260212/uuid.png',
          key: '20260212/uuid.png',
        },
      });
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const { result } = renderHook(() => useUploadsViewModel([]));

      await act(async () => {
        result.current.handleFiles([makeFile()]);
        await vi.runAllTimersAsync();
      });

      expect(mockRecordUpload).not.toHaveBeenCalled();
      expect(result.current.uploads).toEqual([]);
    });

    it('shows error when fetch throws (network error)', async () => {
      mockGetPresignedUploadUrl.mockResolvedValue({
        success: true,
        data: {
          uploadUrl: 'https://r2.example.com/presigned',
          publicUrl: 'https://s.zhe.to/20260212/uuid.png',
          key: '20260212/uuid.png',
        },
      });
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useUploadsViewModel([]));

      await act(async () => {
        result.current.handleFiles([makeFile()]);
        await vi.runAllTimersAsync();
      });

      expect(mockRecordUpload).not.toHaveBeenCalled();
      expect(result.current.uploads).toEqual([]);
    });

    it('shows error when recordUpload fails', async () => {
      mockGetPresignedUploadUrl.mockResolvedValue({
        success: true,
        data: {
          uploadUrl: 'https://r2.example.com/presigned',
          publicUrl: 'https://s.zhe.to/20260212/uuid.png',
          key: '20260212/uuid.png',
        },
      });
      mockFetch.mockResolvedValue({ ok: true });
      mockRecordUpload.mockResolvedValue({
        success: false,
        error: 'DB write failed',
      });

      const { result } = renderHook(() => useUploadsViewModel([]));

      await act(async () => {
        result.current.handleFiles([makeFile()]);
        await vi.runAllTimersAsync();
      });

      // Upload should NOT be added to the list
      expect(result.current.uploads).toEqual([]);
    });
  });

  describe('handleDelete', () => {
    it('removes upload from list on success', async () => {
      const uploads = [makeUpload({ id: 1 }), makeUpload({ id: 2 })];
      mockDeleteUploadAction.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useUploadsViewModel(uploads));

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleDelete(1);
      });

      expect(success).toBe(true);
      expect(result.current.uploads).toHaveLength(1);
      expect(result.current.uploads[0].id).toBe(2);
    });

    it('returns false and keeps upload on failure', async () => {
      const uploads = [makeUpload({ id: 1 })];
      mockDeleteUploadAction.mockResolvedValue({ success: false });

      const { result } = renderHook(() => useUploadsViewModel(uploads));

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleDelete(1);
      });

      expect(success).toBe(false);
      expect(result.current.uploads).toHaveLength(1);
    });
  });

  describe('refreshUploads', () => {
    it('replaces uploads with fresh server data', async () => {
      const { result } = renderHook(() => useUploadsViewModel([makeUpload({ id: 1 })]));

      const freshUploads = [makeUpload({ id: 2 }), makeUpload({ id: 3 })];
      mockFetchUploads.mockResolvedValue({ success: true, data: freshUploads });

      await act(async () => {
        await result.current.refreshUploads();
      });

      expect(result.current.uploads).toEqual(freshUploads);
    });

    it('keeps existing uploads if refresh fails', async () => {
      const initial = [makeUpload({ id: 1 })];
      const { result } = renderHook(() => useUploadsViewModel(initial));

      mockFetchUploads.mockResolvedValue({ success: false });

      await act(async () => {
        await result.current.refreshUploads();
      });

      expect(result.current.uploads).toEqual(initial);
    });
  });

  describe('dismissUploadingFile', () => {
    it('removes a file from the uploading list', async () => {
      // Set up a failed upload so there's an item in uploadingFiles
      const { result } = renderHook(() => useUploadsViewModel([]));

      await act(async () => {
        result.current.handleFiles([makeFile('virus.exe', 'application/x-msdownload', 100)]);
        await vi.runAllTimersAsync();
      });

      expect(result.current.uploadingFiles).toHaveLength(1);
      const tempId = result.current.uploadingFiles[0].id;

      act(() => {
        result.current.dismissUploadingFile(tempId);
      });

      expect(result.current.uploadingFiles).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// useUploadItemViewModel
// ---------------------------------------------------------------------------

describe('useUploadItemViewModel', () => {
  const mockOnDelete = vi.fn<(id: number) => Promise<boolean>>();
  const upload = makeUpload({ id: 42, publicUrl: 'https://s.zhe.to/20260212/test.png' });

  beforeEach(() => {
    vi.useFakeTimers();
    mockOnDelete.mockClear();
    mockCopyToClipboard.mockReset();
    vi.stubGlobal('confirm', vi.fn());
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns correct initial state', () => {
    const { result } = renderHook(() => useUploadItemViewModel(upload, mockOnDelete));

    expect(result.current.copied).toBe(false);
    expect(result.current.isDeleting).toBe(false);
  });

  it('handleCopy copies publicUrl and sets copied=true, then false after 2s', async () => {
    mockCopyToClipboard.mockResolvedValue(true);

    const { result } = renderHook(() => useUploadItemViewModel(upload, mockOnDelete));

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(mockCopyToClipboard).toHaveBeenCalledWith('https://s.zhe.to/20260212/test.png');
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.copied).toBe(false);
  });

  it('handleCopy does not set copied when copyToClipboard fails', async () => {
    mockCopyToClipboard.mockResolvedValue(false);

    const { result } = renderHook(() => useUploadItemViewModel(upload, mockOnDelete));

    await act(async () => {
      await result.current.handleCopy();
    });

    expect(result.current.copied).toBe(false);
  });

  it('handleDelete with confirm=true calls onDelete on success', async () => {
    vi.mocked(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockOnDelete.mockResolvedValue(true);

    const { result } = renderHook(() => useUploadItemViewModel(upload, mockOnDelete));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(globalThis.confirm).toHaveBeenCalledWith('确定要删除这个文件吗？删除后无法恢复。');
    expect(mockOnDelete).toHaveBeenCalledWith(42);
    expect(result.current.isDeleting).toBe(false);
  });

  it('handleDelete shows alert on failure', async () => {
    vi.mocked(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockOnDelete.mockResolvedValue(false);

    const { result } = renderHook(() => useUploadItemViewModel(upload, mockOnDelete));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(globalThis.alert).toHaveBeenCalledWith('删除失败，请重试');
    expect(result.current.isDeleting).toBe(false);
  });

  it('handleDelete with confirm=false does nothing', async () => {
    vi.mocked(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const { result } = renderHook(() => useUploadItemViewModel(upload, mockOnDelete));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockOnDelete).not.toHaveBeenCalled();
    expect(result.current.isDeleting).toBe(false);
  });
});
