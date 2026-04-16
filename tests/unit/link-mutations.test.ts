import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock tag actions
vi.mock('@/actions/tags', () => ({
  createTag: vi.fn(),
  addTagToLink: vi.fn(),
  removeTagFromLink: vi.fn(),
}));

import { useLinkMutations } from '@/viewmodels/useLinkMutations';
import type { Tag, LinkTag } from '@/models/types';

describe('useLinkMutations — getUnassignedTags', () => {
  const allTags: Tag[] = [
    { id: 'tag-1', name: 'React', color: '#f00', userId: 'u1', createdAt: new Date() },
    { id: 'tag-2', name: 'Vue', color: '#0f0', userId: 'u1', createdAt: new Date() },
    { id: 'tag-3', name: 'Svelte', color: '#00f', userId: 'u1', createdAt: new Date() },
  ];

  const allLinkTags: LinkTag[] = [
    { linkId: 1, tagId: 'tag-1' },
  ];

  const callbacks = {
    onLinkUpdated: vi.fn(),
    onTagCreated: vi.fn(),
    onLinkTagAdded: vi.fn(),
    onLinkTagRemoved: vi.fn(),
  };

  it('returns tags not assigned to a given link', () => {
    const { result } = renderHook(() =>
      useLinkMutations(allTags, allLinkTags, callbacks),
    );

    const unassigned = result.current.getUnassignedTags(1);

    expect(unassigned).toHaveLength(2);
    expect(unassigned.map((t) => t.id)).toEqual(['tag-2', 'tag-3']);
  });
});
