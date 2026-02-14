import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// ScopedDB mock instance methods
const mockGetFolders = vi.fn();
const mockCreateFolder = vi.fn();
const mockUpdateFolder = vi.fn();
const mockDeleteFolder = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    getFolders: mockGetFolders,
    createFolder: mockCreateFolder,
    updateFolder: mockUpdateFolder,
    deleteFolder: mockDeleteFolder,
  })),
}));

// Suppress console.error noise from catch blocks
vi.spyOn(console, 'error').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} from '@/actions/folders';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER_ID = 'user-abc-123';

function authenticatedSession() {
  return { user: { id: FAKE_USER_ID, name: 'Test', email: 'test@test.com' } };
}

const FAKE_FOLDER = {
  id: 'folder-uuid-1',
  userId: FAKE_USER_ID,
  name: 'Work',
  icon: 'briefcase',
  createdAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('actions/folders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // getFolders
  // ====================================================================
  describe('getFolders', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await getFolders();

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error when db.getFolders throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetFolders.mockRejectedValue(new Error('timeout'));

      const result = await getFolders();

      expect(result).toEqual({ success: false, error: 'Failed to get folders' });
    });

    it('returns folders on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetFolders.mockResolvedValue([FAKE_FOLDER]);

      const result = await getFolders();

      expect(result).toEqual({ success: true, data: [FAKE_FOLDER] });
    });

    it('returns empty array when user has no folders', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetFolders.mockResolvedValue([]);

      const result = await getFolders();

      expect(result).toEqual({ success: true, data: [] });
    });
  });

  // ====================================================================
  // createFolder
  // ====================================================================
  describe('createFolder', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await createFolder({ name: 'Test' });

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error for empty name', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await createFolder({ name: '   ' });

      expect(result).toEqual({ success: false, error: 'Invalid folder name' });
      expect(mockCreateFolder).not.toHaveBeenCalled();
    });

    it('returns error for name exceeding max length', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await createFolder({ name: 'a'.repeat(51) });

      expect(result).toEqual({ success: false, error: 'Invalid folder name' });
      expect(mockCreateFolder).not.toHaveBeenCalled();
    });

    it('returns error for invalid icon', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await createFolder({ name: 'Test', icon: 'not-a-real-icon' });

      expect(result).toEqual({ success: false, error: 'Invalid icon' });
      expect(mockCreateFolder).not.toHaveBeenCalled();
    });

    it('creates folder with name only (default icon)', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateFolder.mockResolvedValue(FAKE_FOLDER);

      const result = await createFolder({ name: 'Work' });

      expect(result).toEqual({ success: true, data: FAKE_FOLDER });
      expect(mockCreateFolder).toHaveBeenCalledWith({ name: 'Work' });
    });

    it('creates folder with name and icon', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateFolder.mockResolvedValue(FAKE_FOLDER);

      const result = await createFolder({ name: 'Work', icon: 'briefcase' });

      expect(result).toEqual({ success: true, data: FAKE_FOLDER });
      expect(mockCreateFolder).toHaveBeenCalledWith({ name: 'Work', icon: 'briefcase' });
    });

    it('trims whitespace from name', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateFolder.mockResolvedValue(FAKE_FOLDER);

      await createFolder({ name: '  Work  ' });

      expect(mockCreateFolder).toHaveBeenCalledWith({ name: 'Work' });
    });

    it('returns error when db.createFolder throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateFolder.mockRejectedValue(new Error('DB error'));

      const result = await createFolder({ name: 'Work' });

      expect(result).toEqual({ success: false, error: 'Failed to create folder' });
    });
  });

  // ====================================================================
  // updateFolder
  // ====================================================================
  describe('updateFolder', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await updateFolder('folder-1', { name: 'New' });

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error for empty name', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await updateFolder('folder-1', { name: '   ' });

      expect(result).toEqual({ success: false, error: 'Invalid folder name' });
      expect(mockUpdateFolder).not.toHaveBeenCalled();
    });

    it('returns error for name exceeding max length', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await updateFolder('folder-1', { name: 'a'.repeat(51) });

      expect(result).toEqual({ success: false, error: 'Invalid folder name' });
      expect(mockUpdateFolder).not.toHaveBeenCalled();
    });

    it('returns error for invalid icon', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await updateFolder('folder-1', { icon: 'invalid-icon' });

      expect(result).toEqual({ success: false, error: 'Invalid icon' });
      expect(mockUpdateFolder).not.toHaveBeenCalled();
    });

    it('returns not found when db.updateFolder returns null', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateFolder.mockResolvedValue(null);

      const result = await updateFolder('nonexistent', { name: 'Test' });

      expect(result).toEqual({
        success: false,
        error: 'Folder not found or access denied',
      });
    });

    it('updates folder name on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updatedFolder = { ...FAKE_FOLDER, name: 'Renamed' };
      mockUpdateFolder.mockResolvedValue(updatedFolder);

      const result = await updateFolder('folder-uuid-1', { name: 'Renamed' });

      expect(result).toEqual({ success: true, data: updatedFolder });
      expect(mockUpdateFolder).toHaveBeenCalledWith('folder-uuid-1', { name: 'Renamed' });
    });

    it('updates folder icon on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updatedFolder = { ...FAKE_FOLDER, icon: 'star' };
      mockUpdateFolder.mockResolvedValue(updatedFolder);

      const result = await updateFolder('folder-uuid-1', { icon: 'star' });

      expect(result).toEqual({ success: true, data: updatedFolder });
      expect(mockUpdateFolder).toHaveBeenCalledWith('folder-uuid-1', { icon: 'star' });
    });

    it('updates both name and icon on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updatedFolder = { ...FAKE_FOLDER, name: 'New', icon: 'heart' };
      mockUpdateFolder.mockResolvedValue(updatedFolder);

      const result = await updateFolder('folder-uuid-1', { name: 'New', icon: 'heart' });

      expect(result).toEqual({ success: true, data: updatedFolder });
      expect(mockUpdateFolder).toHaveBeenCalledWith('folder-uuid-1', { name: 'New', icon: 'heart' });
    });

    it('trims whitespace from name when updating', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateFolder.mockResolvedValue(FAKE_FOLDER);

      await updateFolder('folder-uuid-1', { name: '  Trimmed  ' });

      expect(mockUpdateFolder).toHaveBeenCalledWith('folder-uuid-1', { name: 'Trimmed' });
    });

    it('returns error when db.updateFolder throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateFolder.mockRejectedValue(new Error('DB error'));

      const result = await updateFolder('folder-1', { name: 'Test' });

      expect(result).toEqual({ success: false, error: 'Failed to update folder' });
    });
  });

  // ====================================================================
  // deleteFolder
  // ====================================================================
  describe('deleteFolder', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await deleteFolder('folder-1');

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns not found when db.deleteFolder returns false', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteFolder.mockResolvedValue(false);

      const result = await deleteFolder('nonexistent');

      expect(result).toEqual({
        success: false,
        error: 'Folder not found or access denied',
      });
    });

    it('returns success when folder is deleted', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteFolder.mockResolvedValue(true);

      const result = await deleteFolder('folder-uuid-1');

      expect(result).toEqual({ success: true });
      expect(mockDeleteFolder).toHaveBeenCalledWith('folder-uuid-1');
    });

    it('returns error when db.deleteFolder throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteFolder.mockRejectedValue(new Error('constraint'));

      const result = await deleteFolder('folder-1');

      expect(result).toEqual({ success: false, error: 'Failed to delete folder' });
    });
  });
});
