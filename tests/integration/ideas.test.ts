import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createIdea,
  getIdea,
  getIdeas,
  updateIdea,
  deleteIdea,
} from '@/actions/ideas';
import { createTag } from '@/actions/tags';
import { clearMockStorage } from '../mocks/db-storage';
import { unwrap } from '../test-utils';

// Mock auth to return a test user
vi.mock('@/auth', () => ({
  auth: vi
    .fn()
    .mockResolvedValue({ user: { id: 'test-user-id', name: 'Test', email: 'test@test.com' } }),
}));

describe('Idea Server Actions', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  describe('createIdea', () => {
    it('creates an idea with content only', async () => {
      const result = await createIdea({
        content: '# My Idea\n\nSome **bold** text.',
      });

      expect(result.success).toBe(true);
      const idea = unwrap(result.data);
      expect(idea.content).toBe('# My Idea\n\nSome **bold** text.');
      expect(idea.title).toBeNull();
      expect(idea.excerpt).toBe('My Idea Some bold text.');
      expect(idea.tagIds).toEqual([]);
    });

    it('creates an idea with title', async () => {
      const result = await createIdea({
        content: 'Body text',
        title: 'My Title',
      });

      expect(result.success).toBe(true);
      const idea = unwrap(result.data);
      expect(idea.title).toBe('My Title');
      expect(idea.content).toBe('Body text');
    });

    it('creates an idea with tags', async () => {
      const tag1 = unwrap((await createTag({ name: 'work', color: 'primary' })).data);
      const tag2 = unwrap((await createTag({ name: 'project', color: 'jade' })).data);

      const result = await createIdea({
        content: 'Tagged idea',
        tagIds: [tag1.id, tag2.id],
      });

      expect(result.success).toBe(true);
      const idea = unwrap(result.data);
      expect(idea.tagIds).toHaveLength(2);
      expect(idea.tagIds).toContain(tag1.id);
      expect(idea.tagIds).toContain(tag2.id);
    });

    it('rejects empty content', async () => {
      const result = await createIdea({
        content: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Content cannot be empty');
    });

    it('rejects invalid tag IDs', async () => {
      const result = await createIdea({
        content: 'Body',
        tagIds: ['non-existent-tag'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid tag IDs');
    });
  });

  describe('getIdea', () => {
    it('returns idea with full content', async () => {
      const created = unwrap((await createIdea({ content: 'Full content here' })).data);

      const result = await getIdea(created.id);

      expect(result.success).toBe(true);
      const idea = unwrap(result.data);
      expect(idea.id).toBe(created.id);
      expect(idea.content).toBe('Full content here');
    });

    it('returns error for non-existent idea', async () => {
      const result = await getIdea(9999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Idea not found');
    });
  });

  describe('getIdeas', () => {
    it('returns all ideas for user', async () => {
      await createIdea({ content: 'Idea 1' });
      await createIdea({ content: 'Idea 2' });

      const result = await getIdeas();

      expect(result.success).toBe(true);
      expect(unwrap(result.data)).toHaveLength(2);
    });

    it('returns list shape without full content', async () => {
      await createIdea({ content: 'Full markdown content here' });

      const result = await getIdeas();

      expect(result.success).toBe(true);
      const ideas = unwrap(result.data);
      expect(ideas).toHaveLength(1);
      const idea = unwrap(ideas[0]);
      expect(idea.excerpt).toBeTruthy();
      // List shape should not include content
      expect((idea as unknown as Record<string, unknown>).content).toBeUndefined();
    });

    it('filters by tag', async () => {
      const tag = unwrap((await createTag({ name: 'filter-tag', color: 'sky' })).data);
      await createIdea({ content: 'Tagged', tagIds: [tag.id] });
      await createIdea({ content: 'Not tagged' });

      const result = await getIdeas({ tagId: tag.id });

      expect(result.success).toBe(true);
      const ideas = unwrap(result.data);
      expect(ideas).toHaveLength(1);
      expect(unwrap(ideas[0]).tagIds).toContain(tag.id);
    });
  });

  describe('updateIdea', () => {
    it('updates title and content', async () => {
      const created = unwrap(
        (await createIdea({ content: 'Original', title: 'Old Title' })).data,
      );

      const result = await updateIdea(created.id, {
        title: 'New Title',
        content: 'New content',
      });

      expect(result.success).toBe(true);
      const idea = unwrap(result.data);
      expect(idea.title).toBe('New Title');
      expect(idea.content).toBe('New content');
      expect(idea.excerpt).toBe('New content');
    });

    it('sets title to null', async () => {
      const created = unwrap(
        (await createIdea({ content: 'Body', title: 'Has Title' })).data,
      );

      const result = await updateIdea(created.id, { title: null });

      expect(result.success).toBe(true);
      expect(unwrap(result.data).title).toBeNull();
    });

    it('syncs tags atomically', async () => {
      const tag1 = unwrap((await createTag({ name: 'tag1', color: 'primary' })).data);
      const tag2 = unwrap((await createTag({ name: 'tag2', color: 'jade' })).data);
      const tag3 = unwrap((await createTag({ name: 'tag3', color: 'rose' })).data);

      const created = unwrap(
        (await createIdea({ content: 'Body', tagIds: [tag1.id, tag2.id] })).data,
      );
      expect(created.tagIds).toHaveLength(2);

      const result = await updateIdea(created.id, { tagIds: [tag2.id, tag3.id] });

      expect(result.success).toBe(true);
      const idea = unwrap(result.data);
      expect(idea.tagIds).toHaveLength(2);
      expect(idea.tagIds).toContain(tag2.id);
      expect(idea.tagIds).toContain(tag3.id);
      expect(idea.tagIds).not.toContain(tag1.id);
    });

    it('rejects empty content', async () => {
      const created = unwrap((await createIdea({ content: 'Body' })).data);

      const result = await updateIdea(created.id, { content: '   ' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Content cannot be empty');
    });

    it('returns error for non-existent idea', async () => {
      const result = await updateIdea(9999, { title: 'New' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Idea not found');
    });

    it('rejects invalid tag IDs', async () => {
      const created = unwrap((await createIdea({ content: 'Body' })).data);

      const result = await updateIdea(created.id, { tagIds: ['non-existent'] });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid tag IDs');
    });
  });

  describe('deleteIdea', () => {
    it('deletes an idea', async () => {
      const created = unwrap((await createIdea({ content: 'To delete' })).data);

      const result = await deleteIdea(created.id);

      expect(result.success).toBe(true);

      // Verify idea is gone
      const getResult = await getIdea(created.id);
      expect(getResult.success).toBe(false);
    });

    it('returns error for non-existent idea', async () => {
      const result = await deleteIdea(9999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Idea not found');
    });
  });
});
