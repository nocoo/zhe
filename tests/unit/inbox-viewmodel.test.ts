import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Link, Tag, LinkTag, Folder } from '@/models/types';

// ── Mocks ──

vi.mock('@/actions/links', () => ({
  updateLink: vi.fn(),
  updateLinkNote: vi.fn(),
}));

vi.mock('@/actions/tags', () => ({
  createTag: vi.fn(),
  addTagToLink: vi.fn(),
  removeTagFromLink: vi.fn(),
}));

import { useInboxViewModel, type InboxCallbacks } from '@/viewmodels/useInboxViewModel';
import { updateLink, updateLinkNote } from '@/actions/links';
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

  // ── getDraft ──

  describe('getDraft', () => {
    it('returns default draft for a link not yet edited', () => {
      const link = makeLink({ id: 1, note: null });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], makeCallbacks()),
      );

      const draft = result.current.getDraft(1);
      expect(draft.folderId).toBeUndefined();
      expect(draft.note).toBe('');
      expect(draft.screenshotUrl).toBe('');
      expect(draft.isSaving).toBe(false);
      expect(draft.error).toBe('');
    });

    it('returns link existing note in default draft', () => {
      const link = makeLink({ id: 1, note: 'existing note' });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], makeCallbacks()),
      );

      const draft = result.current.getDraft(1);
      expect(draft.note).toBe('existing note');
    });

    it('returns link existing screenshotUrl in default draft', () => {
      const link = makeLink({ id: 1, screenshotUrl: 'https://img.example.com/shot.png' });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], makeCallbacks()),
      );

      const draft = result.current.getDraft(1);
      expect(draft.screenshotUrl).toBe('https://img.example.com/shot.png');
    });

    it('returns stored draft after editing', () => {
      const link = makeLink({ id: 1 });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], makeCallbacks()),
      );

      act(() => { result.current.setDraftFolderId(1, 'folder-1'); });
      act(() => { result.current.setDraftNote(1, 'my note'); });

      const draft = result.current.getDraft(1);
      expect(draft.folderId).toBe('folder-1');
      expect(draft.note).toBe('my note');
    });
  });

  // ── setDraftFolderId ──

  describe('setDraftFolderId', () => {
    it('updates the draft folder', () => {
      const link = makeLink({ id: 1 });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], makeCallbacks()),
      );

      act(() => { result.current.setDraftFolderId(1, 'folder-1'); });

      expect(result.current.getDraft(1).folderId).toBe('folder-1');
    });

    it('can clear the folder back to undefined', () => {
      const link = makeLink({ id: 1 });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], makeCallbacks()),
      );

      act(() => { result.current.setDraftFolderId(1, 'folder-1'); });
      act(() => { result.current.setDraftFolderId(1, undefined); });

      expect(result.current.getDraft(1).folderId).toBeUndefined();
    });
  });

  // ── setDraftScreenshotUrl ──

  describe('setDraftScreenshotUrl', () => {
    it('updates the draft screenshotUrl', () => {
      const link = makeLink({ id: 1 });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], makeCallbacks()),
      );

      act(() => { result.current.setDraftScreenshotUrl(1, 'https://img.example.com/shot.png'); });

      expect(result.current.getDraft(1).screenshotUrl).toBe('https://img.example.com/shot.png');
    });

    it('can clear the screenshotUrl back to empty string', () => {
      const link = makeLink({ id: 1 });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], makeCallbacks()),
      );

      act(() => { result.current.setDraftScreenshotUrl(1, 'https://img.example.com/shot.png'); });
      act(() => { result.current.setDraftScreenshotUrl(1, ''); });

      expect(result.current.getDraft(1).screenshotUrl).toBe('');
    });
  });

  // ── setDraftNote ──

  describe('setDraftNote', () => {
    it('updates the draft note', () => {
      const link = makeLink({ id: 1 });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], makeCallbacks()),
      );

      act(() => { result.current.setDraftNote(1, 'hello world'); });

      expect(result.current.getDraft(1).note).toBe('hello world');
    });
  });

  // ── saveItem ──

  describe('saveItem', () => {
    it('calls updateLink + updateLinkNote + onLinkUpdated and cleans up draft', async () => {
      const link = makeLink({ id: 1, note: 'old note' });
      const cbs = makeCallbacks();
      const updatedLink = makeLink({ id: 1, originalUrl: 'https://example.com' });

      vi.mocked(updateLink).mockResolvedValue({ success: true, data: updatedLink });
      vi.mocked(updateLinkNote).mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [makeFolder()], [], [], cbs),
      );

      act(() => { result.current.setDraftFolderId(1, 'folder-1'); });
      act(() => { result.current.setDraftNote(1, 'new note'); });

      await act(async () => { await result.current.saveItem(1); });

      expect(updateLink).toHaveBeenCalledWith(1, {
        originalUrl: 'https://example.com',
        folderId: 'folder-1',
      });
      expect(updateLinkNote).toHaveBeenCalledWith(1, 'new note');
      expect(cbs.onLinkUpdated).toHaveBeenCalledWith({
        ...updatedLink,
        note: 'new note',
        screenshotUrl: null,
      });
      // Draft should be cleaned up
      const draft = result.current.getDraft(1);
      expect(draft.isSaving).toBe(false);
      expect(draft.error).toBe('');
    });

    it('skips updateLinkNote when note is unchanged', async () => {
      const link = makeLink({ id: 1, note: 'same' });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1 }),
      });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      // getDraft will initialize note to 'same' — don't change it

      await act(async () => { await result.current.saveItem(1); });

      expect(updateLinkNote).not.toHaveBeenCalled();
      expect(cbs.onLinkUpdated).toHaveBeenCalled();
    });

    it('sets error when updateLink fails', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: false,
        error: 'Invalid URL',
      });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      await act(async () => { await result.current.saveItem(1); });

      const draft = result.current.getDraft(1);
      expect(draft.error).toBe('Invalid URL');
      expect(draft.isSaving).toBe(false);
      expect(cbs.onLinkUpdated).not.toHaveBeenCalled();
    });

    it('sets error when updateLinkNote fails', async () => {
      const link = makeLink({ id: 1, note: null });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1 }),
      });
      vi.mocked(updateLinkNote).mockResolvedValue({
        success: false,
        error: 'Note too long',
      });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      act(() => { result.current.setDraftNote(1, 'new note'); });

      await act(async () => { await result.current.saveItem(1); });

      const draft = result.current.getDraft(1);
      expect(draft.error).toBe('Note too long');
      expect(draft.isSaving).toBe(false);
      expect(cbs.onLinkUpdated).not.toHaveBeenCalled();
    });

    it('handles unexpected exceptions', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      await act(async () => { await result.current.saveItem(1); });

      const draft = result.current.getDraft(1);
      expect(draft.error).toBe('An unexpected error occurred');
      expect(draft.isSaving).toBe(false);
      expect(cbs.onLinkUpdated).not.toHaveBeenCalled();
    });

    it('does nothing for non-existent link', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      await act(async () => { await result.current.saveItem(999); });

      expect(updateLink).not.toHaveBeenCalled();
      expect(cbs.onLinkUpdated).not.toHaveBeenCalled();
    });

    it('clears note to null when draft note is empty/whitespace', async () => {
      const link = makeLink({ id: 1, note: 'old note' });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1 }),
      });
      vi.mocked(updateLinkNote).mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      act(() => { result.current.setDraftNote(1, '   '); });

      await act(async () => { await result.current.saveItem(1); });

      expect(updateLinkNote).toHaveBeenCalledWith(1, null);
      expect(cbs.onLinkUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ note: null }),
      );
    });

    it('uses default error message when updateLink returns no error string', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({ success: false });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      await act(async () => { await result.current.saveItem(1); });

      expect(result.current.getDraft(1).error).toBe('Failed to update link');
    });

    it('uses default error message when updateLinkNote returns no error string', async () => {
      const link = makeLink({ id: 1, note: null });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1 }),
      });
      vi.mocked(updateLinkNote).mockResolvedValue({ success: false });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      act(() => { result.current.setDraftNote(1, 'changed'); });

      await act(async () => { await result.current.saveItem(1); });

      expect(result.current.getDraft(1).error).toBe('Failed to update note');
    });

    it('includes screenshotUrl in updateLink payload when changed', async () => {
      const link = makeLink({ id: 1, screenshotUrl: null });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1 }),
      });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      act(() => { result.current.setDraftScreenshotUrl(1, 'https://img.example.com/new.png'); });

      await act(async () => { await result.current.saveItem(1); });

      expect(updateLink).toHaveBeenCalledWith(1, expect.objectContaining({
        screenshotUrl: 'https://img.example.com/new.png',
      }));
    });

    it('omits screenshotUrl from updateLink payload when unchanged', async () => {
      const link = makeLink({ id: 1, screenshotUrl: 'https://img.example.com/existing.png' });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1 }),
      });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      // Don't change screenshotUrl — getDraft will initialize it to existing value

      await act(async () => { await result.current.saveItem(1); });

      const payload = vi.mocked(updateLink).mock.calls[0][1];
      expect(payload).not.toHaveProperty('screenshotUrl');
    });

    it('clears screenshotUrl to null when emptied', async () => {
      const link = makeLink({ id: 1, screenshotUrl: 'https://img.example.com/old.png' });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1 }),
      });

      const { result } = renderHook(() =>
        useInboxViewModel([link], [], [], [], cbs),
      );

      act(() => { result.current.setDraftScreenshotUrl(1, ''); });

      await act(async () => { await result.current.saveItem(1); });

      expect(updateLink).toHaveBeenCalledWith(1, expect.objectContaining({
        screenshotUrl: null,
      }));
      expect(cbs.onLinkUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ screenshotUrl: null }),
      );
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
