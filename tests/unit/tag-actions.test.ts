import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// ScopedDB mock instance methods
const mockGetTags = vi.fn();
const mockCreateTag = vi.fn();
const mockUpdateTag = vi.fn();
const mockDeleteTag = vi.fn();
const mockGetLinkTags = vi.fn();
const mockAddTagToLink = vi.fn();
const mockRemoveTagFromLink = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(() => ({
    getTags: mockGetTags,
    createTag: mockCreateTag,
    updateTag: mockUpdateTag,
    deleteTag: mockDeleteTag,
    getLinkTags: mockGetLinkTags,
    addTagToLink: mockAddTagToLink,
    removeTagFromLink: mockRemoveTagFromLink,
  })),
}));

// Suppress console.error noise from catch blocks
vi.spyOn(console, 'error').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  getLinkTags,
  addTagToLink,
  removeTagFromLink,
} from '@/actions/tags';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER_ID = 'user-abc-123';

function authenticatedSession() {
  return { user: { id: FAKE_USER_ID, name: 'Test', email: 'test@test.com' } };
}

const FAKE_TAG = {
  id: 'tag-uuid-1',
  userId: FAKE_USER_ID,
  name: 'work',
  color: 'cobalt',
  createdAt: new Date(),
};

const FAKE_LINK_TAG = {
  linkId: 1,
  tagId: 'tag-uuid-1',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('actions/tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // getTags
  // ====================================================================
  describe('getTags', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);
      const result = await getTags();
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns tags on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetTags.mockResolvedValue([FAKE_TAG]);
      const result = await getTags();
      expect(result).toEqual({ success: true, data: [FAKE_TAG] });
    });

    it('returns empty array when user has no tags', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetTags.mockResolvedValue([]);
      const result = await getTags();
      expect(result).toEqual({ success: true, data: [] });
    });

    it('returns error when db.getTags throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetTags.mockRejectedValue(new Error('timeout'));
      const result = await getTags();
      expect(result).toEqual({ success: false, error: 'Failed to get tags' });
    });
  });

  // ====================================================================
  // createTag
  // ====================================================================
  describe('createTag', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);
      const result = await createTag({ name: 'test' });
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error for empty name', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const result = await createTag({ name: '   ' });
      expect(result).toEqual({ success: false, error: 'Invalid tag name' });
      expect(mockCreateTag).not.toHaveBeenCalled();
    });

    it('returns error for name exceeding max length', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const result = await createTag({ name: 'a'.repeat(31) });
      expect(result).toEqual({ success: false, error: 'Invalid tag name' });
      expect(mockCreateTag).not.toHaveBeenCalled();
    });

    it('returns error for invalid color', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const result = await createTag({ name: 'test', color: 'neon-green' });
      expect(result).toEqual({ success: false, error: 'Invalid tag color' });
      expect(mockCreateTag).not.toHaveBeenCalled();
    });

    it('creates tag with name and specified color', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateTag.mockResolvedValue(FAKE_TAG);
      const result = await createTag({ name: 'work', color: 'cobalt' });
      expect(result).toEqual({ success: true, data: FAKE_TAG });
      expect(mockCreateTag).toHaveBeenCalledWith({ name: 'work', color: 'cobalt' });
    });

    it('creates tag with deterministic color when color is omitted', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateTag.mockResolvedValue(FAKE_TAG);
      const result = await createTag({ name: 'work' });
      expect(result.success).toBe(true);
      // Verify createTag was called with a valid color derived from name
      const call = mockCreateTag.mock.calls[0][0];
      expect(call.name).toBe('work');
      expect(typeof call.color).toBe('string');
    });

    it('trims whitespace from name', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateTag.mockResolvedValue(FAKE_TAG);
      await createTag({ name: '  work  ', color: 'red' });
      expect(mockCreateTag).toHaveBeenCalledWith({ name: 'work', color: 'red' });
    });

    it('returns error when db.createTag throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateTag.mockRejectedValue(new Error('DB error'));
      const result = await createTag({ name: 'work', color: 'red' });
      expect(result).toEqual({ success: false, error: 'Failed to create tag' });
    });
  });

  // ====================================================================
  // updateTag
  // ====================================================================
  describe('updateTag', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);
      const result = await updateTag('tag-1', { name: 'new' });
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error for empty name', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const result = await updateTag('tag-1', { name: '   ' });
      expect(result).toEqual({ success: false, error: 'Invalid tag name' });
      expect(mockUpdateTag).not.toHaveBeenCalled();
    });

    it('returns error for name exceeding max length', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const result = await updateTag('tag-1', { name: 'a'.repeat(31) });
      expect(result).toEqual({ success: false, error: 'Invalid tag name' });
      expect(mockUpdateTag).not.toHaveBeenCalled();
    });

    it('returns error for invalid color', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const result = await updateTag('tag-1', { color: 'invalid' });
      expect(result).toEqual({ success: false, error: 'Invalid tag color' });
      expect(mockUpdateTag).not.toHaveBeenCalled();
    });

    it('returns not found when db.updateTag returns null', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateTag.mockResolvedValue(null);
      const result = await updateTag('nonexistent', { name: 'test' });
      expect(result).toEqual({ success: false, error: 'Tag not found or access denied' });
    });

    it('updates tag name on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updated = { ...FAKE_TAG, name: 'personal' };
      mockUpdateTag.mockResolvedValue(updated);
      const result = await updateTag('tag-uuid-1', { name: 'personal' });
      expect(result).toEqual({ success: true, data: updated });
      expect(mockUpdateTag).toHaveBeenCalledWith('tag-uuid-1', { name: 'personal' });
    });

    it('updates tag color on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updated = { ...FAKE_TAG, color: 'red' };
      mockUpdateTag.mockResolvedValue(updated);
      const result = await updateTag('tag-uuid-1', { color: 'red' });
      expect(result).toEqual({ success: true, data: updated });
      expect(mockUpdateTag).toHaveBeenCalledWith('tag-uuid-1', { color: 'red' });
    });

    it('updates both name and color on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      const updated = { ...FAKE_TAG, name: 'new', color: 'green' };
      mockUpdateTag.mockResolvedValue(updated);
      const result = await updateTag('tag-uuid-1', { name: 'new', color: 'green' });
      expect(result).toEqual({ success: true, data: updated });
      expect(mockUpdateTag).toHaveBeenCalledWith('tag-uuid-1', { name: 'new', color: 'green' });
    });

    it('trims whitespace from name', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateTag.mockResolvedValue(FAKE_TAG);
      await updateTag('tag-uuid-1', { name: '  trimmed  ' });
      expect(mockUpdateTag).toHaveBeenCalledWith('tag-uuid-1', { name: 'trimmed' });
    });

    it('returns error when db.updateTag throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateTag.mockRejectedValue(new Error('DB error'));
      const result = await updateTag('tag-1', { name: 'test' });
      expect(result).toEqual({ success: false, error: 'Failed to update tag' });
    });
  });

  // ====================================================================
  // deleteTag
  // ====================================================================
  describe('deleteTag', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);
      const result = await deleteTag('tag-1');
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns not found when db.deleteTag returns false', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteTag.mockResolvedValue(false);
      const result = await deleteTag('nonexistent');
      expect(result).toEqual({ success: false, error: 'Tag not found or access denied' });
    });

    it('returns success when tag is deleted', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteTag.mockResolvedValue(true);
      const result = await deleteTag('tag-uuid-1');
      expect(result).toEqual({ success: true });
      expect(mockDeleteTag).toHaveBeenCalledWith('tag-uuid-1');
    });

    it('returns error when db.deleteTag throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteTag.mockRejectedValue(new Error('constraint'));
      const result = await deleteTag('tag-1');
      expect(result).toEqual({ success: false, error: 'Failed to delete tag' });
    });
  });

  // ====================================================================
  // getLinkTags
  // ====================================================================
  describe('getLinkTags', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);
      const result = await getLinkTags();
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns link tags on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinkTags.mockResolvedValue([FAKE_LINK_TAG]);
      const result = await getLinkTags();
      expect(result).toEqual({ success: true, data: [FAKE_LINK_TAG] });
    });

    it('returns empty array when no associations exist', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinkTags.mockResolvedValue([]);
      const result = await getLinkTags();
      expect(result).toEqual({ success: true, data: [] });
    });

    it('returns error when db.getLinkTags throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetLinkTags.mockRejectedValue(new Error('timeout'));
      const result = await getLinkTags();
      expect(result).toEqual({ success: false, error: 'Failed to get link tags' });
    });
  });

  // ====================================================================
  // addTagToLink
  // ====================================================================
  describe('addTagToLink', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);
      const result = await addTagToLink(1, 'tag-1');
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns success when tag is added to link', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockAddTagToLink.mockResolvedValue(true);
      const result = await addTagToLink(1, 'tag-uuid-1');
      expect(result).toEqual({ success: true });
      expect(mockAddTagToLink).toHaveBeenCalledWith(1, 'tag-uuid-1');
    });

    it('returns error when db.addTagToLink returns false', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockAddTagToLink.mockResolvedValue(false);
      const result = await addTagToLink(1, 'tag-uuid-1');
      expect(result).toEqual({ success: false, error: 'Failed to add tag to link' });
    });

    it('returns error when db.addTagToLink throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockAddTagToLink.mockRejectedValue(new Error('FK constraint'));
      const result = await addTagToLink(1, 'tag-uuid-1');
      expect(result).toEqual({ success: false, error: 'Failed to add tag to link' });
    });
  });

  // ====================================================================
  // removeTagFromLink
  // ====================================================================
  describe('removeTagFromLink', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);
      const result = await removeTagFromLink(1, 'tag-1');
      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns success when tag is removed from link', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockRemoveTagFromLink.mockResolvedValue(true);
      const result = await removeTagFromLink(1, 'tag-uuid-1');
      expect(result).toEqual({ success: true });
      expect(mockRemoveTagFromLink).toHaveBeenCalledWith(1, 'tag-uuid-1');
    });

    it('returns not found when db.removeTagFromLink returns false', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockRemoveTagFromLink.mockResolvedValue(false);
      const result = await removeTagFromLink(1, 'tag-uuid-1');
      expect(result).toEqual({ success: false, error: 'Link-tag association not found' });
    });

    it('returns error when db.removeTagFromLink throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockRemoveTagFromLink.mockRejectedValue(new Error('DB error'));
      const result = await removeTagFromLink(1, 'tag-uuid-1');
      expect(result).toEqual({ success: false, error: 'Failed to remove tag from link' });
    });
  });
});
