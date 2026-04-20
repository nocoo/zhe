// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// ScopedDB mock instance methods
const mockGetIdeas = vi.fn();
const mockGetIdeaById = vi.fn();
const mockCreateIdea = vi.fn();
const mockUpdateIdea = vi.fn();
const mockDeleteIdea = vi.fn();

vi.mock('@/lib/db/scoped', () => ({
  ScopedDB: vi.fn().mockImplementation(function () {
    return {
      getIdeas: mockGetIdeas,
      getIdeaById: mockGetIdeaById,
      createIdea: mockCreateIdea,
      updateIdea: mockUpdateIdea,
      deleteIdea: mockDeleteIdea,
    };
  }),
}));

// Suppress console.error noise from catch blocks
vi.spyOn(console, 'error').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import {
  getIdeas,
  getIdea,
  createIdea,
  updateIdea,
  deleteIdea,
} from '@/actions/ideas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_USER_ID = 'user-abc-123';

function authenticatedSession() {
  return { user: { id: FAKE_USER_ID, name: 'Test', email: 'test@test.com' } };
}

const FAKE_IDEA_LIST = {
  id: 1,
  title: 'My Idea',
  excerpt: 'Some markdown text',
  tagIds: ['tag-1'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const FAKE_IDEA_DETAIL = {
  ...FAKE_IDEA_LIST,
  content: '# My Idea\n\nSome **markdown** text.',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('actions/ideas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // getIdeas
  // ====================================================================
  describe('getIdeas', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await getIdeas();

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error when db.getIdeas throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetIdeas.mockRejectedValue(new Error('timeout'));

      const result = await getIdeas();

      expect(result).toEqual({ success: false, error: 'Failed to get ideas' });
    });

    it('returns ideas on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetIdeas.mockResolvedValue([FAKE_IDEA_LIST]);

      const result = await getIdeas();

      expect(result).toEqual({ success: true, data: [FAKE_IDEA_LIST] });
    });

    it('returns empty array when user has no ideas', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetIdeas.mockResolvedValue([]);

      const result = await getIdeas();

      expect(result).toEqual({ success: true, data: [] });
    });

    it('passes options to db.getIdeas', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetIdeas.mockResolvedValue([]);

      await getIdeas({ tagId: 'tag-1' });

      expect(mockGetIdeas).toHaveBeenCalledWith({ tagId: 'tag-1' });
    });
  });

  // ====================================================================
  // getIdea
  // ====================================================================
  describe('getIdea', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await getIdea(1);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error when idea not found', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetIdeaById.mockResolvedValue(null);

      const result = await getIdea(999);

      expect(result).toEqual({ success: false, error: 'Idea not found' });
    });

    it('returns error when db.getIdeaById throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetIdeaById.mockRejectedValue(new Error('timeout'));

      const result = await getIdea(1);

      expect(result).toEqual({ success: false, error: 'Failed to get idea' });
    });

    it('returns idea with full content on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockGetIdeaById.mockResolvedValue(FAKE_IDEA_DETAIL);

      const result = await getIdea(1);

      expect(result).toEqual({ success: true, data: FAKE_IDEA_DETAIL });
    });
  });

  // ====================================================================
  // createIdea
  // ====================================================================
  describe('createIdea', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await createIdea({ content: 'Test' });

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error when content is empty', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await createIdea({ content: '   ' });

      expect(result).toEqual({ success: false, error: 'Content cannot be empty' });
    });

    it('returns error when db.createIdea throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateIdea.mockRejectedValue(new Error('timeout'));

      const result = await createIdea({ content: 'Test' });

      expect(result).toEqual({ success: false, error: 'Failed to create idea' });
    });

    it('returns specific error for invalid tag IDs', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateIdea.mockRejectedValue(new Error('Invalid tag IDs: bad-tag'));

      const result = await createIdea({ content: 'Test', tagIds: ['bad-tag'] });

      expect(result).toEqual({ success: false, error: 'Invalid tag IDs: bad-tag' });
    });

    it('creates idea with content only', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateIdea.mockResolvedValue(FAKE_IDEA_DETAIL);

      const result = await createIdea({ content: 'Test content' });

      expect(result).toEqual({ success: true, data: FAKE_IDEA_DETAIL });
      expect(mockCreateIdea).toHaveBeenCalledWith({ content: 'Test content' });
    });

    it('creates idea with title', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateIdea.mockResolvedValue(FAKE_IDEA_DETAIL);

      const result = await createIdea({ content: 'Test', title: 'My Title' });

      expect(result).toEqual({ success: true, data: FAKE_IDEA_DETAIL });
      expect(mockCreateIdea).toHaveBeenCalledWith({
        content: 'Test',
        title: 'My Title',
      });
    });

    it('creates idea with tags', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockCreateIdea.mockResolvedValue(FAKE_IDEA_DETAIL);

      const result = await createIdea({ content: 'Test', tagIds: ['tag-1', 'tag-2'] });

      expect(result).toEqual({ success: true, data: FAKE_IDEA_DETAIL });
      expect(mockCreateIdea).toHaveBeenCalledWith({
        content: 'Test',
        tagIds: ['tag-1', 'tag-2'],
      });
    });
  });

  // ====================================================================
  // updateIdea
  // ====================================================================
  describe('updateIdea', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await updateIdea(1, { title: 'New Title' });

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error when content is empty', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());

      const result = await updateIdea(1, { content: '   ' });

      expect(result).toEqual({ success: false, error: 'Content cannot be empty' });
    });

    it('returns error when idea not found', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateIdea.mockResolvedValue(null);

      const result = await updateIdea(999, { title: 'New' });

      expect(result).toEqual({ success: false, error: 'Idea not found' });
    });

    it('returns error when db.updateIdea throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateIdea.mockRejectedValue(new Error('timeout'));

      const result = await updateIdea(1, { title: 'New' });

      expect(result).toEqual({ success: false, error: 'Failed to update idea' });
    });

    it('returns specific error for invalid tag IDs', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateIdea.mockRejectedValue(new Error('Invalid tag IDs: bad-tag'));

      const result = await updateIdea(1, { tagIds: ['bad-tag'] });

      expect(result).toEqual({ success: false, error: 'Invalid tag IDs: bad-tag' });
    });

    it('updates idea title', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateIdea.mockResolvedValue({ ...FAKE_IDEA_DETAIL, title: 'Updated' });

      const result = await updateIdea(1, { title: 'Updated' });

      expect(result.success).toBe(true);
      expect(mockUpdateIdea).toHaveBeenCalledWith(1, { title: 'Updated' });
    });

    it('updates idea content', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateIdea.mockResolvedValue({ ...FAKE_IDEA_DETAIL, content: 'New content' });

      const result = await updateIdea(1, { content: 'New content' });

      expect(result.success).toBe(true);
      expect(mockUpdateIdea).toHaveBeenCalledWith(1, { content: 'New content' });
    });

    it('updates idea tags', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateIdea.mockResolvedValue({ ...FAKE_IDEA_DETAIL, tagIds: ['tag-2'] });

      const result = await updateIdea(1, { tagIds: ['tag-2'] });

      expect(result.success).toBe(true);
      expect(mockUpdateIdea).toHaveBeenCalledWith(1, { tagIds: ['tag-2'] });
    });

    it('clears title with null', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockUpdateIdea.mockResolvedValue({ ...FAKE_IDEA_DETAIL, title: null });

      const result = await updateIdea(1, { title: null });

      expect(result.success).toBe(true);
      expect(mockUpdateIdea).toHaveBeenCalledWith(1, { title: null });
    });
  });

  // ====================================================================
  // deleteIdea
  // ====================================================================
  describe('deleteIdea', () => {
    it('returns Unauthorized when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const result = await deleteIdea(1);

      expect(result).toEqual({ success: false, error: 'Unauthorized' });
    });

    it('returns error when idea not found', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteIdea.mockResolvedValue(false);

      const result = await deleteIdea(999);

      expect(result).toEqual({ success: false, error: 'Idea not found' });
    });

    it('returns error when db.deleteIdea throws', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteIdea.mockRejectedValue(new Error('timeout'));

      const result = await deleteIdea(1);

      expect(result).toEqual({ success: false, error: 'Failed to delete idea' });
    });

    it('deletes idea on success', async () => {
      mockAuth.mockResolvedValue(authenticatedSession());
      mockDeleteIdea.mockResolvedValue(true);

      const result = await deleteIdea(1);

      expect(result).toEqual({ success: true });
      expect(mockDeleteIdea).toHaveBeenCalledWith(1);
    });
  });
});