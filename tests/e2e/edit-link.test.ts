/**
 * E2E Edit-Link Tests
 *
 * Tests the full edit-link flow through server actions with the in-memory D1 mock.
 * Validates the complete lifecycle from the perspective of an authenticated user:
 *   - Updating link URL and folder
 *   - Updating link notes
 *   - Creating, assigning, and removing tags
 *   - Multi-user isolation for tags and link-tags
 *   - Tag validation and edge cases
 *   - Cascade delete behavior (deleting a tag removes its link associations)
 *
 * BDD style — each scenario simulates a real user workflow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearMockStorage } from '../setup';
import type { Link, Tag } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Mocks — auth (D1 uses the global mock from setup.ts)
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_A = 'user-edit-e2e-a';
const USER_B = 'user-edit-e2e-b';

function authenticatedAs(userId: string) {
  mockAuth.mockResolvedValue({
    user: { id: userId, name: 'E2E User', email: 'e2e@test.com' },
  });
}

function unauthenticated() {
  mockAuth.mockResolvedValue(null);
}

/** Create a link for the current authenticated user via server action */
async function seedLink(url: string): Promise<Link> {
  const { createLink } = await import('@/actions/links');
  const result = await createLink({ originalUrl: url });
  if (!result.success || !result.data) {
    throw new Error(`Failed to seed link: ${result.error}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Edit-Link E2E — full lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockStorage();
  });

  // ============================================================
  // Scenario 1: Unauthenticated access denied
  // As an unauthenticated visitor, all edit operations should fail.
  // ============================================================
  describe('unauthenticated user', () => {
    it('cannot update a link', async () => {
      unauthenticated();
      const { updateLink } = await import('@/actions/links');

      const result = await updateLink(1, { originalUrl: 'https://evil.com' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot update a link note', async () => {
      unauthenticated();
      const { updateLinkNote } = await import('@/actions/links');

      const result = await updateLinkNote(1, 'sneaky note');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot create tags', async () => {
      unauthenticated();
      const { createTag } = await import('@/actions/tags');

      const result = await createTag({ name: 'sneaky' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot list tags', async () => {
      unauthenticated();
      const { getTags } = await import('@/actions/tags');

      const result = await getTags();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot add tag to link', async () => {
      unauthenticated();
      const { addTagToLink } = await import('@/actions/tags');

      const result = await addTagToLink(1, 'tag-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot remove tag from link', async () => {
      unauthenticated();
      const { removeTagFromLink } = await import('@/actions/tags');

      const result = await removeTagFromLink(1, 'tag-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  // ============================================================
  // Scenario 2: Complete edit-link lifecycle
  // As an authenticated user, I want to:
  // 1. Create a link
  // 2. Update its URL and folder
  // 3. Add a note
  // 4. Create tags and assign them
  // 5. Remove a tag from the link
  // 6. Verify final state
  // ============================================================
  describe('authenticated user — complete edit lifecycle', () => {
    it('create link → update URL → add note → create & assign tags → remove tag → verify', async () => {
      authenticatedAs(USER_A);
      const { updateLink, updateLinkNote, getLinks } = await import('@/actions/links');
      const { createTag, getTags, getLinkTags, addTagToLink, removeTagFromLink } =
        await import('@/actions/tags');

      // Step 1: Create a link
      const link = await seedLink('https://original.com');
      expect(link.originalUrl).toBe('https://original.com');
      expect(link.note).toBeNull();

      // Step 2: Update URL
      const urlResult = await updateLink(link.id, {
        originalUrl: 'https://updated.com',
      });
      expect(urlResult.success).toBe(true);
      expect(urlResult.data!.originalUrl).toBe('https://updated.com');

      // Step 3: Add a note
      const noteResult = await updateLinkNote(link.id, 'Important bookmark');
      expect(noteResult.success).toBe(true);
      expect(noteResult.data!.note).toBe('Important bookmark');

      // Step 4: Create two tags
      const tag1Result = await createTag({ name: 'work', color: 'blue' });
      expect(tag1Result.success).toBe(true);
      const tag1 = tag1Result.data!;
      expect(tag1.name).toBe('work');
      expect(tag1.color).toBe('blue');

      const tag2Result = await createTag({ name: 'reference', color: 'emerald' });
      expect(tag2Result.success).toBe(true);
      const tag2 = tag2Result.data!;

      // Step 5: Assign both tags to the link
      const assign1 = await addTagToLink(link.id, tag1.id);
      expect(assign1.success).toBe(true);

      const assign2 = await addTagToLink(link.id, tag2.id);
      expect(assign2.success).toBe(true);

      // Step 6: Verify link-tag associations
      const linkTagsResult = await getLinkTags();
      expect(linkTagsResult.success).toBe(true);
      expect(linkTagsResult.data).toHaveLength(2);

      const assignedTagIds = linkTagsResult.data!.map((lt) => lt.tagId).sort();
      expect(assignedTagIds).toEqual([tag1.id, tag2.id].sort());

      // Step 7: Remove one tag
      const removeResult = await removeTagFromLink(link.id, tag1.id);
      expect(removeResult.success).toBe(true);

      // Step 8: Verify only one tag remains
      const linkTagsAfter = await getLinkTags();
      expect(linkTagsAfter.data).toHaveLength(1);
      expect(linkTagsAfter.data![0].tagId).toBe(tag2.id);

      // Step 9: Verify tags are still intact (removing from link doesn't delete the tag)
      const allTags = await getTags();
      expect(allTags.data).toHaveLength(2);

      // Step 10: Verify link state via getLinks
      const linksResult = await getLinks();
      expect(linksResult.success).toBe(true);
      const finalLink = linksResult.data!.find((l) => l.id === link.id);
      expect(finalLink!.originalUrl).toBe('https://updated.com');
      expect(finalLink!.note).toBe('Important bookmark');
    });
  });

  // ============================================================
  // Scenario 3: Tag CRUD lifecycle
  // As an authenticated user, I want to manage tags:
  // create → list → update (name + color) → delete
  // ============================================================
  describe('tag CRUD lifecycle', () => {
    it('create → list → update → delete', async () => {
      authenticatedAs(USER_A);
      const { createTag, getTags, updateTag, deleteTag } =
        await import('@/actions/tags');

      // Create
      const createResult = await createTag({ name: 'devops', color: 'orange' });
      expect(createResult.success).toBe(true);
      const tag = createResult.data!;
      expect(tag.name).toBe('devops');
      expect(tag.color).toBe('orange');

      // List
      const listResult = await getTags();
      expect(listResult.data).toHaveLength(1);
      expect(listResult.data![0].id).toBe(tag.id);

      // Update name
      const updateNameResult = await updateTag(tag.id, { name: 'infrastructure' });
      expect(updateNameResult.success).toBe(true);
      expect(updateNameResult.data!.name).toBe('infrastructure');
      expect(updateNameResult.data!.color).toBe('orange'); // color unchanged

      // Update color
      const updateColorResult = await updateTag(tag.id, { color: 'teal' });
      expect(updateColorResult.success).toBe(true);
      expect(updateColorResult.data!.name).toBe('infrastructure'); // name unchanged
      expect(updateColorResult.data!.color).toBe('teal');

      // Delete
      const deleteResult = await deleteTag(tag.id);
      expect(deleteResult.success).toBe(true);

      // Verify gone
      const listAfterDelete = await getTags();
      expect(listAfterDelete.data).toHaveLength(0);
    });
  });

  // ============================================================
  // Scenario 4: Cascade delete — deleting a tag removes link-tag
  // associations, but the link itself stays intact.
  // ============================================================
  describe('cascade delete behavior', () => {
    it('deleting a tag removes its link-tag associations', async () => {
      authenticatedAs(USER_A);
      const { createTag, deleteTag, addTagToLink, getLinkTags } =
        await import('@/actions/tags');

      // Create a link and a tag
      const link = await seedLink('https://cascade-test.com');
      const tagResult = await createTag({ name: 'temporary', color: 'pink' });
      const tag = tagResult.data!;

      // Assign tag to link
      await addTagToLink(link.id, tag.id);

      // Verify association exists
      const before = await getLinkTags();
      expect(before.data).toHaveLength(1);

      // Delete the tag
      await deleteTag(tag.id);

      // Verify association is also gone (CASCADE)
      const after = await getLinkTags();
      expect(after.data).toHaveLength(0);
    });

    it('deleting a link removes its link-tag associations', async () => {
      authenticatedAs(USER_A);
      const { deleteLink } = await import('@/actions/links');
      const { createTag, addTagToLink, getLinkTags, getTags } =
        await import('@/actions/tags');

      // Create a link and a tag, then associate
      const link = await seedLink('https://link-delete-test.com');
      const tagResult = await createTag({ name: 'permanent', color: 'indigo' });
      const tag = tagResult.data!;
      await addTagToLink(link.id, tag.id);

      // Verify association exists
      const before = await getLinkTags();
      expect(before.data).toHaveLength(1);

      // Delete the link
      const deleteResult = await deleteLink(link.id);
      expect(deleteResult.success).toBe(true);

      // Verify association is gone (CASCADE)
      const after = await getLinkTags();
      expect(after.data).toHaveLength(0);

      // Tag itself should still exist
      const tags = await getTags();
      expect(tags.data).toHaveLength(1);
      expect(tags.data![0].id).toBe(tag.id);
    });
  });

  // ============================================================
  // Scenario 5: Multi-user isolation
  // User A's tags and link-tag associations should be invisible
  // to User B, and vice versa.
  // ============================================================
  describe('multi-user isolation', () => {
    it('users cannot see or modify each other\'s tags', async () => {
      const { createTag, getTags, updateTag, deleteTag } =
        await import('@/actions/tags');

      // User A creates tags
      authenticatedAs(USER_A);
      const tagA = await createTag({ name: 'user-a-tag', color: 'red' });
      expect(tagA.success).toBe(true);

      // User B creates tags
      authenticatedAs(USER_B);
      const tagB = await createTag({ name: 'user-b-tag', color: 'blue' });
      expect(tagB.success).toBe(true);

      // User B can only see their own tags
      const listB = await getTags();
      expect(listB.data).toHaveLength(1);
      expect(listB.data![0].name).toBe('user-b-tag');

      // User B cannot update User A's tag
      const updateAttempt = await updateTag(tagA.data!.id, { name: 'hacked' });
      expect(updateAttempt.success).toBe(false);
      expect(updateAttempt.error).toBe('Tag not found or access denied');

      // User B cannot delete User A's tag
      const deleteAttempt = await deleteTag(tagA.data!.id);
      expect(deleteAttempt.success).toBe(false);

      // Switch to User A — their tag should still exist unmodified
      authenticatedAs(USER_A);
      const listA = await getTags();
      expect(listA.data).toHaveLength(1);
      expect(listA.data![0].name).toBe('user-a-tag');
    });

    it('users cannot see or modify each other\'s link-tag associations', async () => {
      const { createTag, addTagToLink, getLinkTags, removeTagFromLink } =
        await import('@/actions/tags');

      // User A creates a link + tag + association
      authenticatedAs(USER_A);
      const linkA = await seedLink('https://user-a.com');
      const tagA = await createTag({ name: 'a-private', color: 'amber' });
      await addTagToLink(linkA.id, tagA.data!.id);

      // User B creates a link + tag + association
      authenticatedAs(USER_B);
      const linkB = await seedLink('https://user-b.com');
      const tagB = await createTag({ name: 'b-private', color: 'violet' });
      await addTagToLink(linkB.id, tagB.data!.id);

      // User B can only see their own link-tags
      const ltB = await getLinkTags();
      expect(ltB.data).toHaveLength(1);
      expect(ltB.data![0].linkId).toBe(linkB.id);

      // User B tries to remove User A's link-tag — should fail
      const removeAttempt = await removeTagFromLink(linkA.id, tagA.data!.id);
      expect(removeAttempt.success).toBe(false);

      // Switch to User A — their association is intact
      authenticatedAs(USER_A);
      const ltA = await getLinkTags();
      expect(ltA.data).toHaveLength(1);
      expect(ltA.data![0].linkId).toBe(linkA.id);
    });
  });

  // ============================================================
  // Scenario 6: Note lifecycle
  // As an authenticated user, I want to add, update, and clear notes.
  // ============================================================
  describe('note lifecycle', () => {
    it('add note → update note → clear note', async () => {
      authenticatedAs(USER_A);
      const { updateLinkNote, getLinks } = await import('@/actions/links');

      const link = await seedLink('https://note-test.com');
      expect(link.note).toBeNull();

      // Add note
      const addResult = await updateLinkNote(link.id, 'First note');
      expect(addResult.success).toBe(true);
      expect(addResult.data!.note).toBe('First note');

      // Update note
      const updateResult = await updateLinkNote(link.id, 'Updated note');
      expect(updateResult.success).toBe(true);
      expect(updateResult.data!.note).toBe('Updated note');

      // Clear note (set to null)
      const clearResult = await updateLinkNote(link.id, null);
      expect(clearResult.success).toBe(true);
      expect(clearResult.data!.note).toBeNull();

      // Verify via getLinks
      const linksResult = await getLinks();
      const finalLink = linksResult.data!.find((l) => l.id === link.id);
      expect(finalLink!.note).toBeNull();
    });
  });

  // ============================================================
  // Scenario 7: Tag validation
  // Server actions should reject invalid tag names and colors.
  // ============================================================
  describe('tag validation', () => {
    beforeEach(() => {
      authenticatedAs(USER_A);
    });

    it('rejects empty tag name', async () => {
      const { createTag } = await import('@/actions/tags');

      const result = await createTag({ name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid tag name');
    });

    it('rejects whitespace-only tag name', async () => {
      const { createTag } = await import('@/actions/tags');

      const result = await createTag({ name: '   ' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid tag name');
    });

    it('rejects tag name exceeding 30 characters', async () => {
      const { createTag } = await import('@/actions/tags');

      const result = await createTag({ name: 'a'.repeat(31) });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid tag name');
    });

    it('rejects invalid color on create', async () => {
      const { createTag } = await import('@/actions/tags');

      const result = await createTag({ name: 'valid-name', color: 'neon-green' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid tag color');
    });

    it('rejects invalid color on update', async () => {
      const { createTag, updateTag } = await import('@/actions/tags');

      const tag = await createTag({ name: 'test', color: 'blue' });
      const result = await updateTag(tag.data!.id, { color: 'rainbow' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid tag color');
    });

    it('trims tag name whitespace', async () => {
      const { createTag } = await import('@/actions/tags');

      const result = await createTag({ name: '  trimmed  ', color: 'rose' });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('trimmed');
    });

    it('assigns deterministic color from name when none specified', async () => {
      const { createTag } = await import('@/actions/tags');
      const { TAG_COLORS, tagColorFromName } = await import('@/models/tags');

      const result = await createTag({ name: 'auto-color' });

      expect(result.success).toBe(true);
      expect(TAG_COLORS).toContain(result.data!.color);
      expect(result.data!.color).toBe(tagColorFromName('auto-color'));
    });
  });

  // ============================================================
  // Scenario 8: Multiple tags on multiple links
  // As an authenticated user, I want to assign the same tag to
  // multiple links and multiple tags to the same link.
  // ============================================================
  describe('many-to-many relationships', () => {
    it('one tag can be assigned to multiple links', async () => {
      authenticatedAs(USER_A);
      const { createTag, addTagToLink, getLinkTags } =
        await import('@/actions/tags');

      const link1 = await seedLink('https://site-1.com');
      const link2 = await seedLink('https://site-2.com');
      const link3 = await seedLink('https://site-3.com');

      const tag = await createTag({ name: 'shared', color: 'cyan' });

      await addTagToLink(link1.id, tag.data!.id);
      await addTagToLink(link2.id, tag.data!.id);
      await addTagToLink(link3.id, tag.data!.id);

      const linkTags = await getLinkTags();
      expect(linkTags.data).toHaveLength(3);

      const linkedIds = linkTags.data!.map((lt) => lt.linkId).sort((a, b) => a - b);
      expect(linkedIds).toEqual([link1.id, link2.id, link3.id].sort((a, b) => a - b));
    });

    it('one link can have multiple tags', async () => {
      authenticatedAs(USER_A);
      const { createTag, addTagToLink, getLinkTags } =
        await import('@/actions/tags');

      const link = await seedLink('https://multi-tag.com');

      const tags: Tag[] = [];
      const colors = ['red', 'blue', 'emerald', 'orange', 'violet'];
      for (const color of colors) {
        const result = await createTag({ name: `tag-${color}`, color });
        tags.push(result.data!);
      }

      for (const tag of tags) {
        await addTagToLink(link.id, tag.id);
      }

      const linkTags = await getLinkTags();
      expect(linkTags.data).toHaveLength(5);

      const assignedTagIds = linkTags.data!.map((lt) => lt.tagId).sort();
      const expectedIds = tags.map((t) => t.id).sort();
      expect(assignedTagIds).toEqual(expectedIds);
    });
  });

  // ============================================================
  // Scenario 9: Edit link with invalid data
  // Server actions should reject invalid URLs and non-existent links.
  // ============================================================
  describe('edit link validation', () => {
    beforeEach(() => {
      authenticatedAs(USER_A);
    });

    it('rejects invalid URL on update', async () => {
      const { updateLink } = await import('@/actions/links');

      const link = await seedLink('https://valid.com');
      const result = await updateLink(link.id, { originalUrl: 'not-a-url' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid URL');
    });

    it('rejects update for non-existent link', async () => {
      const { updateLink } = await import('@/actions/links');

      const result = await updateLink(99999, { originalUrl: 'https://ghost.com' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Link not found or access denied');
    });

    it('rejects note update for non-existent link', async () => {
      const { updateLinkNote } = await import('@/actions/links');

      const result = await updateLinkNote(99999, 'orphaned note');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Link not found or access denied');
    });

    it('rejects adding tag to non-existent link', async () => {
      const { createTag, addTagToLink } = await import('@/actions/tags');

      const tag = await createTag({ name: 'orphan', color: 'slate' });
      const result = await addTagToLink(99999, tag.data!.id);

      expect(result.success).toBe(false);
    });
  });

  // ============================================================
  // Scenario 10: Slug editing lifecycle
  // As an authenticated user, I want to change a link's slug,
  // including validation, uniqueness checks, and edge cases.
  // ============================================================
  describe('slug editing', () => {
    beforeEach(() => {
      authenticatedAs(USER_A);
    });

    it('updates slug to a new custom value', async () => {
      const { updateLink, getLinks } = await import('@/actions/links');

      const link = await seedLink('https://slug-test.com');
      const result = await updateLink(link.id, { slug: 'my-custom-slug' });

      expect(result.success).toBe(true);
      expect(result.data!.slug).toBe('my-custom-slug');
      expect(result.data!.isCustom).toBe(true);

      // Verify persisted
      const links = await getLinks();
      const found = links.data!.find(l => l.id === link.id);
      expect(found!.slug).toBe('my-custom-slug');
    });

    it('allows keeping the same slug (no-op for custom slug)', async () => {
      const { updateLink } = await import('@/actions/links');

      // First create and set a custom lowercase slug
      const link = await seedLink('https://same-slug.com');
      const setResult = await updateLink(link.id, { slug: 'my-stable' });
      expect(setResult.success).toBe(true);

      // Now "update" to the same slug — should succeed
      const result = await updateLink(link.id, { slug: 'my-stable' });

      expect(result.success).toBe(true);
      expect(result.data!.slug).toBe('my-stable');
    });

    it('rejects slug that is already taken by another link', async () => {
      const { updateLink } = await import('@/actions/links');

      const link1 = await seedLink('https://slug-a.com');
      // Give link1 a known lowercase custom slug
      await updateLink(link1.id, { slug: 'taken-one' });

      const link2 = await seedLink('https://slug-b.com');

      // Try to set link2's slug to link1's slug
      const result = await updateLink(link2.id, { slug: 'taken-one' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('This slug is already taken');
    });

    it('rejects invalid slug characters', async () => {
      const { updateLink } = await import('@/actions/links');

      const link = await seedLink('https://invalid-slug.com');
      const result = await updateLink(link.id, { slug: 'has spaces!' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid slug');
    });

    it('rejects reserved path as slug', async () => {
      const { updateLink } = await import('@/actions/links');

      const link = await seedLink('https://reserved-slug.com');
      const result = await updateLink(link.id, { slug: 'dashboard' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid slug');
    });

    it('lowercases slug via sanitizeSlug', async () => {
      const { updateLink } = await import('@/actions/links');

      const link = await seedLink('https://case-slug.com');
      const result = await updateLink(link.id, { slug: 'MySlug' });

      expect(result.success).toBe(true);
      expect(result.data!.slug).toBe('myslug');
    });

    it('cross-user slug uniqueness — cannot steal another user slug', async () => {
      const { updateLink } = await import('@/actions/links');

      // User A creates a link with a known custom slug
      const linkA = await seedLink('https://user-a.com');
      await updateLink(linkA.id, { slug: 'user-a-slug' });

      // User B creates a link
      authenticatedAs(USER_B);
      const linkB = await seedLink('https://user-b.com');

      // User B tries to change slug to User A's slug
      const result = await updateLink(linkB.id, { slug: 'user-a-slug' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('This slug is already taken');
    });

    it('can update slug and URL simultaneously', async () => {
      const { updateLink } = await import('@/actions/links');

      const link = await seedLink('https://both.com');
      const result = await updateLink(link.id, {
        originalUrl: 'https://updated-both.com',
        slug: 'both-updated',
      });

      expect(result.success).toBe(true);
      expect(result.data!.originalUrl).toBe('https://updated-both.com');
      expect(result.data!.slug).toBe('both-updated');
      expect(result.data!.isCustom).toBe(true);
    });
  });
});
