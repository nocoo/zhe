'use server';

import { getAuthContext } from '@/lib/auth-context';
import type { IdeaListItem, IdeaDetail, GetIdeasOptions } from '@/lib/db/scoped';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T | undefined;
  error?: string | undefined;
}

export interface CreateIdeaInput {
  content: string;
  title?: string | undefined;
  tagIds?: string[] | undefined;
}

export interface UpdateIdeaInput {
  title?: string | null | undefined;
  content?: string | undefined;
  tagIds?: string[] | undefined;
}

/**
 * Get all ideas for the current user.
 */
export async function getIdeas(
  options: GetIdeasOptions = {},
): Promise<ActionResult<IdeaListItem[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }
    const { db } = ctx;

    const ideas = await db.getIdeas(options);
    return { success: true, data: ideas };
  } catch (error) {
    console.error('Failed to get ideas:', error);
    return { success: false, error: 'Failed to get ideas' };
  }
}

/**
 * Get a single idea by ID.
 */
export async function getIdea(id: number): Promise<ActionResult<IdeaDetail>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }
    const { db } = ctx;

    const idea = await db.getIdeaById(id);
    if (!idea) {
      return { success: false, error: 'Idea not found' };
    }
    return { success: true, data: idea };
  } catch (error) {
    console.error('Failed to get idea:', error);
    return { success: false, error: 'Failed to get idea' };
  }
}

/**
 * Create a new idea.
 */
export async function createIdea(
  input: CreateIdeaInput,
): Promise<ActionResult<IdeaDetail>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }
    const { db } = ctx;

    // Validate content is not empty
    if (!input.content.trim()) {
      return { success: false, error: 'Content cannot be empty' };
    }

    const idea = await db.createIdea({
      content: input.content,
      ...(input.title !== undefined && { title: input.title }),
      ...(input.tagIds !== undefined && { tagIds: input.tagIds }),
    });

    return { success: true, data: idea };
  } catch (error) {
    console.error('Failed to create idea:', error);
    // Check for invalid tag IDs error
    if (error instanceof Error && error.message.includes('Invalid tag IDs')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to create idea' };
  }
}

/**
 * Update an existing idea.
 */
export async function updateIdea(
  id: number,
  input: UpdateIdeaInput,
): Promise<ActionResult<IdeaDetail>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }
    const { db } = ctx;

    // Validate content if provided
    if (input.content !== undefined && !input.content.trim()) {
      return { success: false, error: 'Content cannot be empty' };
    }

    const updateData: Parameters<typeof db.updateIdea>[1] = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.content !== undefined) updateData.content = input.content;
    if (input.tagIds !== undefined) updateData.tagIds = input.tagIds;

    const idea = await db.updateIdea(id, updateData);

    if (!idea) {
      return { success: false, error: 'Idea not found' };
    }

    return { success: true, data: idea };
  } catch (error) {
    console.error('Failed to update idea:', error);
    // Check for invalid tag IDs error
    if (error instanceof Error && error.message.includes('Invalid tag IDs')) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to update idea' };
  }
}

/**
 * Delete an idea.
 */
export async function deleteIdea(id: number): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return { success: false, error: 'Unauthorized' };
    }
    const { db } = ctx;

    const deleted = await db.deleteIdea(id);
    if (!deleted) {
      return { success: false, error: 'Idea not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to delete idea:', error);
    return { success: false, error: 'Failed to delete idea' };
  }
}
