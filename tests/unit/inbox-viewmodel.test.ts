import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Link, Tag, LinkTag, Folder } from '@/models/types';

// ── Mocks ──

vi.mock('@/actions/tags', () => ({
  createTag: vi.fn(),
  addTagToLink: vi.fn(),
  removeTagFromLink: vi.fn(),
}));

import { useInboxViewModel, type InboxCallbacks } from '@/viewmodels/useInboxViewModel';
import { createTag, addTagToLink, removeTagFromLink } from '@/actions/tags';

// ── Helpers ──

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 1,
    userId: 'user-1',
    folderId: null,
    originalUrl: 'https://example.com',
    slug: 'abc123',
    isCustom: false,
    expiresAt: null,
    clicks: 0,
    metaTitle: null,
    metaDescription: null,
    metaFavicon: null,
    screenshotUrl: null,
    note: null,
    createdAt: new Date('2026-01-15'),
    ...overrides,
  };
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 'tag-1',
    userId: 'user-1',
    name: 'important',
    color: 'red',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    userId: 'user-1',
    name: 'Work',
    icon: 'folder',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeCallbacks(): InboxCallbacks {
  return {
    onLinkUpdated: vi.fn(),
    onTagCreated: vi.fn(),
    onLinkTagAdded: vi.fn(),
    onLinkTagRemoved: vi.fn(),
  };
}

// ── Tests ──

describe('useInboxViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── inboxLinks filtering ──

  describe('inboxLinks filtering', () => {
    it('includes only links with folderId === null', () => {
      const inboxLink = makeLink({ id: 1, folderId: null });
      const categorizedLink = makeLink({ id: 2, folderId: 'folder-1' });

      const { result } = renderHook(() =>
        useInboxViewModel([inboxLink, categorizedLink], [], [], [], makeCallbacks()),
      );

      expect(result.current.inboxLinks).toEqual([inboxLink]);
    });

    it('returns empty array when all links have folders', () => {
      const link1 = makeLink({ id: 1, folderId: 'f1' });
      const link2 = makeLink({ id: 2, folderId: 'f2' });

      const { result } = renderHook(() =>
        useInboxViewModel([link1, link2], [], [], [], makeCallbacks()),
      );

      expect(result.current.inboxLinks).toEqual([]);
    });

    it('returns all links when none have folders', () => {
      const link1 = makeLink({ id: 1 });
      const link2 = makeLink({ id: 2 });

      const { result } = renderHook(() =>
        useInboxViewModel([link1, link2], [], [], [], makeCallbacks()),
      );

      expect(result.current.inboxLinks).toHaveLength(2);
    });
  });

  // ── getAssignedTagIds / getAssignedTags ──

  describe('getAssignedTagIds / getAssignedTags', () => {
    it('computes assignedTagIds from allLinkTags for a given link', () => {
      const link = makeLink({ id: 5 });
      const tags = [makeTag({ id: 't1' }), makeTag({ id: 't2' }), makeTag({ id: 't3' })];
      const linkTags: LinkTag[] = [
        { linkId: 5, tagId: 't1' },
        { linkId: 5, tagId: 't3' },
        { linkId: 99, tagId: 't2' }, // different link
      ];

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], tags, linkTags, makeCallbacks()),
      );

      expect(result.current.getAssignedTagIds(5)).toEqual(new Set(['t1', 't3']));
      expect(result.current.getAssignedTags(5)).toEqual([tags[0], tags[2]]);
    });

    it('returns empty when no linkTags match', () => {
      const link = makeLink({ id: 1 });
      const tags = [makeTag({ id: 't1' })];
      const linkTags: LinkTag[] = [{ linkId: 99, tagId: 't1' }];

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], tags, linkTags, makeCallbacks()),
      );

      expect(result.current.getAssignedTagIds(1).size).toBe(0);
      expect(result.current.getAssignedTags(1)).toEqual([]);
    });
  });

  // ── Tag operations ──

  describe('addTag', () => {
    it('optimistically adds and calls server', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(addTagToLink).mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      await act(async () => { await result.current.addTag(1, 't1'); });

      expect(cbs.onLinkTagAdded).toHaveBeenCalledWith({ linkId: 1, tagId: 't1' });
      expect(addTagToLink).toHaveBeenCalledWith(1, 't1');
    });

    it('rolls back on server failure', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(addTagToLink).mockResolvedValue({ success: false, error: 'fail' });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      await act(async () => { await result.current.addTag(1, 't1'); });

      expect(cbs.onLinkTagAdded).toHaveBeenCalledWith({ linkId: 1, tagId: 't1' });
      expect(cbs.onLinkTagRemoved).toHaveBeenCalledWith(1, 't1');
    });
  });

  describe('removeTag', () => {
    it('optimistically removes and calls server', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(removeTagFromLink).mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      await act(async () => { await result.current.removeTag(1, 't1'); });

      expect(cbs.onLinkTagRemoved).toHaveBeenCalledWith(1, 't1');
      expect(removeTagFromLink).toHaveBeenCalledWith(1, 't1');
    });

    it('rolls back on server failure', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(removeTagFromLink).mockResolvedValue({ success: false, error: 'fail' });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      await act(async () => { await result.current.removeTag(1, 't1'); });

      expect(cbs.onLinkTagRemoved).toHaveBeenCalledWith(1, 't1');
      expect(cbs.onLinkTagAdded).toHaveBeenCalledWith({ linkId: 1, tagId: 't1' });
    });
  });

  // ── Create and assign tag ──

  describe('createAndAssignTag', () => {
    it('creates tag, calls onTagCreated, then assigns to link', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();
      const newTag = makeTag({ id: 't-new', name: 'work' });

      vi.mocked(createTag).mockResolvedValue({ success: true, data: newTag });
      vi.mocked(addTagToLink).mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      await act(async () => { await result.current.createAndAssignTag(1, 'work'); });

      expect(createTag).toHaveBeenCalledWith({ name: 'work' });
      expect(cbs.onTagCreated).toHaveBeenCalledWith(newTag);
      expect(cbs.onLinkTagAdded).toHaveBeenCalledWith({ linkId: 1, tagId: 't-new' });
      expect(addTagToLink).toHaveBeenCalledWith(1, 't-new');
    });

    it('does not assign tag if createTag fails', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(createTag).mockResolvedValue({ success: false, error: 'Invalid name' });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      await act(async () => { await result.current.createAndAssignTag(1, ''); });

      expect(cbs.onTagCreated).not.toHaveBeenCalled();
      expect(cbs.onLinkTagAdded).not.toHaveBeenCalled();
    });
  });

  // ── passthrough props ──

  describe('passthrough props', () => {
    it('exposes folders and allTags as-is', () => {
      const folders = [makeFolder({ id: 'f1' }), makeFolder({ id: 'f2' })];
      const tags = [makeTag({ id: 't1' }), makeTag({ id: 't2' })];

      const { result } = renderHook(() =>
        useInboxViewModel([], folders, tags, [], makeCallbacks()),
      );

      expect(result.current.folders).toBe(folders);
      expect(result.current.allTags).toBe(tags);
    });
  });
});
