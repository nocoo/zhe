import type { Link, Folder, Tag, LinkTag } from '@/models/types';
import type { IdeaListItem } from '@/lib/db/scoped';

/**
 * Creates a minimal Link fixture with sensible defaults.
 * Commonly used across unit tests for links, viewmodels, and components.
 */
export function makeLink(overrides: Partial<Link> = {}): Link {
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

/**
 * Creates a minimal Folder fixture with sensible defaults.
 */
export function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    userId: 'user-1',
    name: 'Work',
    icon: 'briefcase',
    createdAt: new Date('2026-01-10'),
    ...overrides,
  };
}

/**
 * Creates a minimal Tag fixture with sensible defaults.
 */
export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 'tag-1',
    userId: 'user-1',
    name: 'Important',
    color: '#ff0000',
    createdAt: new Date('2026-01-10'),
    ...overrides,
  };
}

/**
 * Creates a minimal LinkTag fixture.
 */
export function makeLinkTag(overrides: Partial<LinkTag> = {}): LinkTag {
  return {
    linkId: 1,
    tagId: 'tag-1',
    ...overrides,
  };
}

/**
 * Creates a minimal IdeaListItem fixture with sensible defaults.
 */
export function makeIdea(overrides: Partial<IdeaListItem> = {}): IdeaListItem {
  return {
    id: 1,
    title: 'Test Idea',
    excerpt: 'Test excerpt',
    tagIds: [],
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T12:00:00Z'),
    ...overrides,
  };
}
