import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Folder } from '@/models/types';
import type { DashboardService } from '@/contexts/dashboard-service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/actions/folders', () => ({
  getFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

const mockService: DashboardService = {
  links: [],
  folders: [],
  tags: [],
  linkTags: [],
  loading: false,
  siteUrl: 'http://localhost:3000',
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
};

vi.mock('@/contexts/dashboard-service', () => ({
  useDashboardService: () => mockService,
}));

// Import after mocks
import { useFoldersViewModel } from '@/viewmodels/useFoldersViewModel';
import {
  createFolder,
  updateFolder,
  deleteFolder,
} from '@/actions/folders';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    userId: 'user-1',
    name: 'Work',
    icon: 'briefcase',
    createdAt: new Date('2026-01-10'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFoldersViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn());
    vi.stubGlobal('alert', vi.fn());
    // Reset folders to empty by default
    mockService.folders = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ====================================================================
  // Initial state
  // ====================================================================
  it('returns folders from DashboardService', () => {
    const folders = [makeFolder(), makeFolder({ id: 'folder-2', name: 'Personal' })];
    mockService.folders = folders;
    const { result } = renderHook(() => useFoldersViewModel());

    expect(result.current.folders).toEqual(folders);
    expect(result.current.editingFolderId).toBeNull();
    expect(result.current.isCreating).toBe(false);
  });

  it('returns empty array when service has no folders', () => {
    mockService.folders = [];
    const { result } = renderHook(() => useFoldersViewModel());

    expect(result.current.folders).toEqual([]);
  });

  // ====================================================================
  // createFolder
  // ====================================================================
  it('handleCreateFolder calls service handleFolderCreated on success', async () => {
    const newFolder = makeFolder({ id: 'folder-new', name: 'New Folder' });
    vi.mocked(createFolder).mockResolvedValue({ success: true, data: newFolder });

    const { result } = renderHook(() => useFoldersViewModel());

    await act(async () => {
      await result.current.handleCreateFolder('New Folder', 'folder');
    });

    expect(createFolder).toHaveBeenCalledWith({ name: 'New Folder', icon: 'folder' });
    expect(mockService.handleFolderCreated).toHaveBeenCalledWith(newFolder);
    expect(result.current.isCreating).toBe(false);
  });

  it('handleCreateFolder shows alert on failure', async () => {
    vi.mocked(createFolder).mockResolvedValue({ success: false, error: 'Invalid folder name' });

    const { result } = renderHook(() => useFoldersViewModel());

    await act(async () => {
      await result.current.handleCreateFolder('', 'folder');
    });

    expect(mockService.handleFolderCreated).not.toHaveBeenCalled();
    expect(globalThis.alert).toHaveBeenCalledWith('Invalid folder name');
  });

  it('handleCreateFolder shows default error when error is empty', async () => {
    vi.mocked(createFolder).mockResolvedValue({ success: false });

    const { result } = renderHook(() => useFoldersViewModel());

    await act(async () => {
      await result.current.handleCreateFolder('Test', 'folder');
    });

    expect(globalThis.alert).toHaveBeenCalledWith('Failed to create folder');
  });

  // ====================================================================
  // updateFolder
  // ====================================================================
  it('handleUpdateFolder calls service handleFolderUpdated on success', async () => {
    const updated = makeFolder({ id: 'folder-1', name: 'Work Projects', icon: 'star' });
    vi.mocked(updateFolder).mockResolvedValue({ success: true, data: updated });

    mockService.folders = [makeFolder()];
    const { result } = renderHook(() => useFoldersViewModel());

    await act(async () => {
      await result.current.handleUpdateFolder('folder-1', { name: 'Work Projects', icon: 'star' });
    });

    expect(updateFolder).toHaveBeenCalledWith('folder-1', { name: 'Work Projects', icon: 'star' });
    expect(mockService.handleFolderUpdated).toHaveBeenCalledWith(updated);
    expect(result.current.editingFolderId).toBeNull();
  });

  it('handleUpdateFolder shows alert on failure', async () => {
    vi.mocked(updateFolder).mockResolvedValue({ success: false, error: 'Not found' });

    mockService.folders = [makeFolder()];
    const { result } = renderHook(() => useFoldersViewModel());

    await act(async () => {
      await result.current.handleUpdateFolder('folder-1', { name: 'New Name' });
    });

    expect(mockService.handleFolderUpdated).not.toHaveBeenCalled();
    expect(globalThis.alert).toHaveBeenCalledWith('Not found');
  });

  it('handleUpdateFolder shows default error when error is empty', async () => {
    vi.mocked(updateFolder).mockResolvedValue({ success: false });

    const { result } = renderHook(() => useFoldersViewModel());

    await act(async () => {
      await result.current.handleUpdateFolder('folder-1', { name: 'Test' });
    });

    expect(globalThis.alert).toHaveBeenCalledWith('Failed to update folder');
  });

  // ====================================================================
  // deleteFolder
  // ====================================================================
  it('handleDeleteFolder calls service handleFolderDeleted on success', async () => {
    vi.mocked(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.mocked(deleteFolder).mockResolvedValue({ success: true });

    mockService.folders = [makeFolder()];
    const { result } = renderHook(() => useFoldersViewModel());

    await act(async () => {
      await result.current.handleDeleteFolder('folder-1');
    });

    expect(deleteFolder).toHaveBeenCalledWith('folder-1');
    expect(mockService.handleFolderDeleted).toHaveBeenCalledWith('folder-1');
  });

  it('handleDeleteFolder does nothing when confirm is false', async () => {
    vi.mocked(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);

    mockService.folders = [makeFolder()];
    const { result } = renderHook(() => useFoldersViewModel());

    await act(async () => {
      await result.current.handleDeleteFolder('folder-1');
    });

    expect(deleteFolder).not.toHaveBeenCalled();
    expect(mockService.handleFolderDeleted).not.toHaveBeenCalled();
  });

  it('handleDeleteFolder shows alert on failure', async () => {
    vi.mocked(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.mocked(deleteFolder).mockResolvedValue({ success: false, error: 'Access denied' });

    mockService.folders = [makeFolder()];
    const { result } = renderHook(() => useFoldersViewModel());

    await act(async () => {
      await result.current.handleDeleteFolder('folder-1');
    });

    expect(mockService.handleFolderDeleted).not.toHaveBeenCalled();
    expect(globalThis.alert).toHaveBeenCalledWith('Access denied');
  });

  it('handleDeleteFolder shows default error when error is empty', async () => {
    vi.mocked(globalThis.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.mocked(deleteFolder).mockResolvedValue({ success: false });

    const { result } = renderHook(() => useFoldersViewModel());

    await act(async () => {
      await result.current.handleDeleteFolder('folder-1');
    });

    expect(globalThis.alert).toHaveBeenCalledWith('Failed to delete folder');
  });

  // ====================================================================
  // Editing state
  // ====================================================================
  it('startEditing sets editingFolderId', () => {
    mockService.folders = [makeFolder()];
    const { result } = renderHook(() => useFoldersViewModel());

    act(() => {
      result.current.startEditing('folder-1');
    });

    expect(result.current.editingFolderId).toBe('folder-1');
  });

  it('cancelEditing clears editingFolderId', () => {
    mockService.folders = [makeFolder()];
    const { result } = renderHook(() => useFoldersViewModel());

    act(() => {
      result.current.startEditing('folder-1');
    });
    expect(result.current.editingFolderId).toBe('folder-1');

    act(() => {
      result.current.cancelEditing();
    });
    expect(result.current.editingFolderId).toBeNull();
  });

  // ====================================================================
  // isCreating state
  // ====================================================================
  it('setIsCreating toggles creating state', () => {
    const { result } = renderHook(() => useFoldersViewModel());

    act(() => {
      result.current.setIsCreating(true);
    });
    expect(result.current.isCreating).toBe(true);

    act(() => {
      result.current.setIsCreating(false);
    });
    expect(result.current.isCreating).toBe(false);
  });
});
