import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Link, Tag, LinkTag } from '@/models/types';

// ── Mocks ──

vi.mock('@/actions/links', () => ({
  updateLink: vi.fn(),
  updateLinkNote: vi.fn(),
  saveScreenshot: vi.fn(),
}));

vi.mock('@/actions/tags', () => ({
  createTag: vi.fn(),
  addTagToLink: vi.fn(),
  removeTagFromLink: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  copyToClipboard: vi.fn(),
  cn: (...inputs: string[]) => inputs.join(' '),
  formatDate: (d: Date) => d.toISOString(),
  formatNumber: (n: number) => String(n),
}));

vi.mock('@/models/links', () => ({
  buildShortUrl: (site: string, slug: string) => `${site}/${slug}`,
  fetchMicrolinkScreenshot: vi.fn().mockResolvedValue(null),
  stripProtocol: (url: string) => url.replace(/^https?:\/\//, ''),
}));

import {
  useEditLinkViewModel,
  type EditLinkCallbacks,
} from '@/viewmodels/useLinksViewModel';
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

function makeCallbacks(): EditLinkCallbacks {
  return {
    onLinkUpdated: vi.fn(),
    onTagCreated: vi.fn(),
    onLinkTagAdded: vi.fn(),
    onLinkTagRemoved: vi.fn(),
  };
}

// ── Tests ──

describe('useEditLinkViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial state ──

  describe('initial state', () => {
    it('starts with dialog closed and empty form', () => {
      const { result } = renderHook(() =>
        useEditLinkViewModel(null, [], [], makeCallbacks()),
      );

      expect(result.current.isOpen).toBe(false);
      expect(result.current.editUrl).toBe('');
      expect(result.current.editSlug).toBe('');
      expect(result.current.editFolderId).toBeUndefined();
      expect(result.current.editNote).toBe('');
      expect(result.current.editScreenshotUrl).toBe('');
      expect(result.current.isSaving).toBe(false);
      expect(result.current.error).toBe('');
    });

    it('has empty assigned tags when link is null', () => {
      const { result } = renderHook(() =>
        useEditLinkViewModel(null, [makeTag()], [], makeCallbacks()),
      );

      expect(result.current.assignedTagIds.size).toBe(0);
      expect(result.current.assignedTags).toEqual([]);
    });
  });

  // ── Assigned tags computation ──

  describe('assigned tags', () => {
    it('computes assignedTagIds from linkTags', () => {
      const link = makeLink({ id: 5 });
      const tags = [makeTag({ id: 't1' }), makeTag({ id: 't2' }), makeTag({ id: 't3' })];
      const linkTags: LinkTag[] = [
        { linkId: 5, tagId: 't1' },
        { linkId: 5, tagId: 't3' },
        { linkId: 99, tagId: 't2' }, // different link
      ];

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, tags, linkTags, makeCallbacks()),
      );

      expect(result.current.assignedTagIds).toEqual(new Set(['t1', 't3']));
      expect(result.current.assignedTags).toEqual([tags[0], tags[2]]);
    });

    it('returns empty when no linkTags match', () => {
      const link = makeLink({ id: 1 });
      const tags = [makeTag({ id: 't1' })];
      const linkTags: LinkTag[] = [{ linkId: 99, tagId: 't1' }];

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, tags, linkTags, makeCallbacks()),
      );

      expect(result.current.assignedTagIds.size).toBe(0);
      expect(result.current.assignedTags).toEqual([]);
    });
  });

  // ── Dialog open/close ──

  describe('dialog open/close', () => {
    it('openDialog populates form and opens dialog', () => {
      const link = makeLink({
        originalUrl: 'https://test.com',
        folderId: 'f1',
        note: 'my note',
        screenshotUrl: 'https://img.example.com/shot.png',
      });
      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], makeCallbacks()),
      );

      act(() => { result.current.openDialog(link); });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.editUrl).toBe('https://test.com');
      expect(result.current.editSlug).toBe('abc123');
      expect(result.current.editFolderId).toBe('f1');
      expect(result.current.editNote).toBe('my note');
      expect(result.current.editScreenshotUrl).toBe('https://img.example.com/shot.png');
      expect(result.current.error).toBe('');
    });

    it('openDialog handles null folderId, note, and screenshotUrl', () => {
      const link = makeLink({ folderId: null, note: null, screenshotUrl: null });
      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], makeCallbacks()),
      );

      act(() => { result.current.openDialog(link); });

      expect(result.current.editFolderId).toBeUndefined();
      expect(result.current.editNote).toBe('');
      expect(result.current.editScreenshotUrl).toBe('');
    });

    it('closeDialog closes dialog and clears error', () => {
      const link = makeLink();
      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], makeCallbacks()),
      );

      act(() => { result.current.openDialog(link); });
      expect(result.current.isOpen).toBe(true);

      act(() => { result.current.closeDialog(); });
      expect(result.current.isOpen).toBe(false);
      expect(result.current.error).toBe('');
    });
  });

  // ── Save edit ──

  describe('saveEdit', () => {
    it('updates link and note, calls onLinkUpdated, closes dialog', async () => {
      const link = makeLink({ id: 1, note: 'old note' });
      const cbs = makeCallbacks();
      const updatedLink = makeLink({ id: 1, originalUrl: 'https://new.com' });

      vi.mocked(updateLink).mockResolvedValue({ success: true, data: updatedLink });
      vi.mocked(updateLinkNote).mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      act(() => { result.current.openDialog(link); });
      act(() => { result.current.setEditUrl('https://new.com'); });
      act(() => { result.current.setEditNote('new note'); });

      await act(async () => { await result.current.saveEdit(); });

      expect(updateLink).toHaveBeenCalledWith(1, {
        originalUrl: 'https://new.com',
        folderId: undefined,
      });
      expect(updateLinkNote).toHaveBeenCalledWith(1, 'new note');
      expect(cbs.onLinkUpdated).toHaveBeenCalledWith({
        ...updatedLink,
        note: 'new note',
        screenshotUrl: null,
      });
      expect(result.current.isOpen).toBe(false);
      expect(result.current.isSaving).toBe(false);
    });

    it('includes slug in updateLink payload when slug is changed', async () => {
      const link = makeLink({ id: 1, slug: 'old-slug' });
      const cbs = makeCallbacks();
      const updatedLink = makeLink({ id: 1, slug: 'new-slug' });

      vi.mocked(updateLink).mockResolvedValue({ success: true, data: updatedLink });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      act(() => { result.current.openDialog(link); });
      act(() => { result.current.setEditSlug('new-slug'); });

      await act(async () => { await result.current.saveEdit(); });

      expect(updateLink).toHaveBeenCalledWith(1, expect.objectContaining({
        slug: 'new-slug',
      }));
    });

    it('omits slug from payload when slug is unchanged', async () => {
      const link = makeLink({ id: 1, slug: 'abc123' });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({ success: true, data: makeLink({ id: 1 }) });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      act(() => { result.current.openDialog(link); });
      // Do NOT change slug

      await act(async () => { await result.current.saveEdit(); });

      const callArgs = vi.mocked(updateLink).mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('slug');
    });

    it('skips updateLinkNote when note is unchanged', async () => {
      const link = makeLink({ id: 1, note: 'same' });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1 }),
      });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      act(() => { result.current.openDialog(link); });
      // Note remains 'same' — no change

      await act(async () => { await result.current.saveEdit(); });

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
        useEditLinkViewModel(link, [], [], cbs),
      );

      act(() => { result.current.openDialog(link); });

      await act(async () => { await result.current.saveEdit(); });

      expect(result.current.error).toBe('Invalid URL');
      expect(result.current.isOpen).toBe(true); // stays open
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
        useEditLinkViewModel(link, [], [], cbs),
      );

      act(() => { result.current.openDialog(link); });
      act(() => { result.current.setEditNote('new note'); });

      await act(async () => { await result.current.saveEdit(); });

      expect(result.current.error).toBe('Note too long');
      expect(result.current.isOpen).toBe(true);
      expect(cbs.onLinkUpdated).not.toHaveBeenCalled();
    });

    it('does nothing when link is null', async () => {
      const cbs = makeCallbacks();
      const { result } = renderHook(() =>
        useEditLinkViewModel(null, [], [], cbs),
      );

      await act(async () => { await result.current.saveEdit(); });

      expect(updateLink).not.toHaveBeenCalled();
      expect(cbs.onLinkUpdated).not.toHaveBeenCalled();
    });

    it('clears note to null when edit note is empty/whitespace', async () => {
      const link = makeLink({ id: 1, note: 'old note' });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1 }),
      });
      vi.mocked(updateLinkNote).mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      act(() => { result.current.openDialog(link); });
      act(() => { result.current.setEditNote('   '); });

      await act(async () => { await result.current.saveEdit(); });

      expect(updateLinkNote).toHaveBeenCalledWith(1, null);
      expect(cbs.onLinkUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ note: null }),
      );
    });

    it('includes screenshotUrl in payload when changed', async () => {
      const link = makeLink({ id: 1, screenshotUrl: null });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1 }),
      });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      act(() => { result.current.openDialog(link); });
      act(() => { result.current.setEditScreenshotUrl('https://img.example.com/shot.png'); });

      await act(async () => { await result.current.saveEdit(); });

      expect(updateLink).toHaveBeenCalledWith(1, expect.objectContaining({
        screenshotUrl: 'https://img.example.com/shot.png',
      }));
      expect(cbs.onLinkUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ screenshotUrl: 'https://img.example.com/shot.png' }),
      );
    });

    it('omits screenshotUrl from payload when unchanged', async () => {
      const link = makeLink({ id: 1, screenshotUrl: 'https://img.example.com/existing.png' });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1, screenshotUrl: 'https://img.example.com/existing.png' }),
      });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      act(() => { result.current.openDialog(link); });
      // Do NOT change screenshotUrl

      await act(async () => { await result.current.saveEdit(); });

      const callArgs = vi.mocked(updateLink).mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('screenshotUrl');
    });

    it('clears screenshotUrl to null when emptied', async () => {
      const link = makeLink({ id: 1, screenshotUrl: 'https://img.example.com/old.png' });
      const cbs = makeCallbacks();

      vi.mocked(updateLink).mockResolvedValue({
        success: true,
        data: makeLink({ id: 1 }),
      });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      act(() => { result.current.openDialog(link); });
      act(() => { result.current.setEditScreenshotUrl(''); });

      await act(async () => { await result.current.saveEdit(); });

      expect(updateLink).toHaveBeenCalledWith(1, expect.objectContaining({
        screenshotUrl: null,
      }));
      expect(cbs.onLinkUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ screenshotUrl: null }),
      );
    });
  });

  // ── Tag operations ──

  describe('tag operations', () => {
    it('addTag optimistically adds and calls server', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(addTagToLink).mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      await act(async () => { await result.current.addTag('t1'); });

      expect(cbs.onLinkTagAdded).toHaveBeenCalledWith({ linkId: 1, tagId: 't1' });
      expect(addTagToLink).toHaveBeenCalledWith(1, 't1');
    });

    it('addTag rolls back on server failure', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(addTagToLink).mockResolvedValue({ success: false, error: 'fail' });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      await act(async () => { await result.current.addTag('t1'); });

      // Optimistic add then rollback remove
      expect(cbs.onLinkTagAdded).toHaveBeenCalledWith({ linkId: 1, tagId: 't1' });
      expect(cbs.onLinkTagRemoved).toHaveBeenCalledWith(1, 't1');
    });

    it('removeTag optimistically removes and calls server', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(removeTagFromLink).mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      await act(async () => { await result.current.removeTag('t1'); });

      expect(cbs.onLinkTagRemoved).toHaveBeenCalledWith(1, 't1');
      expect(removeTagFromLink).toHaveBeenCalledWith(1, 't1');
    });

    it('removeTag rolls back on server failure', async () => {
      const link = makeLink({ id: 1 });
      const cbs = makeCallbacks();

      vi.mocked(removeTagFromLink).mockResolvedValue({ success: false, error: 'fail' });

      const { result } = renderHook(() =>
        useEditLinkViewModel(link, [], [], cbs),
      );

      await act(async () => { await result.current.removeTag('t1'); });

      expect(cbs.onLinkTagRemoved).toHaveBeenCalledWith(1, 't1');
      expect(cbs.onLinkTagAdded).toHaveBeenCalledWith({ linkId: 1, tagId: 't1' });
    });

    it('addTag does nothing when link is null', async () => {
      const cbs = makeCallbacks();
      const { result } = renderHook(() =>
        useEditLinkViewModel(null, [], [], cbs),
      );

      await act(async () => { await result.current.addTag('t1'); });

      expect(addTagToLink).not.toHaveBeenCalled();
      expect(cbs.onLinkTagAdded).not.toHaveBeenCalled();
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
        useEditLinkViewModel(link, [], [], cbs),
      );

      await act(async () => { await result.current.createAndAssignTag('work'); });

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
        useEditLinkViewModel(link, [], [], cbs),
      );

      await act(async () => { await result.current.createAndAssignTag(''); });

      expect(cbs.onTagCreated).not.toHaveBeenCalled();
      expect(cbs.onLinkTagAdded).not.toHaveBeenCalled();
    });

    it('does nothing when link is null', async () => {
      const cbs = makeCallbacks();
      const { result } = renderHook(() =>
        useEditLinkViewModel(null, [], [], cbs),
      );

      await act(async () => { await result.current.createAndAssignTag('test'); });

      expect(createTag).not.toHaveBeenCalled();
    });
  });
});
