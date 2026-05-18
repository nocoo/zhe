/**
 * Idea operations for ScopedDB. Free functions that take userId.
 * ScopedDB methods delegate here to keep scoped.ts small.
 */

import { executeD1Query, executeD1Batch, type D1Statement } from '../d1-client';
import { rowToIdea, rowToIdeaTag } from '../mappers';
import type { IdeaTag } from '../schema';
import { generateExcerpt } from '../../markdown';
import type { GetIdeasOptions, IdeaListItem, IdeaDetail } from './types';

function buildIdeasQuery(
  userId: string,
  options: GetIdeasOptions,
): { conditions: string[]; params: unknown[]; joinClause: string } {
  const { query, tagId } = options;
  const conditions: string[] = ['i.user_id = ?'];
  const params: unknown[] = [userId];

  if (query) {
    const searchPattern = `%${query}%`;
    conditions.push(`(i.title LIKE ? OR i.excerpt LIKE ?)`);
    params.push(searchPattern, searchPattern);
  }

  let joinClause = '';
  if (tagId) {
    joinClause = 'JOIN idea_tags it ON i.id = it.idea_id';
    conditions.push('it.tag_id = ?');
    params.push(tagId);
  }

  return { conditions, params, joinClause };
}

/** Helper: Get a map of idea_id → tagIds[] for efficient list population. */
async function getIdeaTagMap(ideaIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (ideaIds.length === 0) return map;

  const placeholders = ideaIds.map(() => '?').join(', ');
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT idea_id, tag_id FROM idea_tags WHERE idea_id IN (${placeholders})`,
    ideaIds,
  );

  for (const row of rows) {
    const ideaId = row.idea_id as number;
    const tagId = row.tag_id as string;
    const existing = map.get(ideaId);
    if (existing) existing.push(tagId);
    else map.set(ideaId, [tagId]);
  }

  return map;
}

function rowToListItem(row: Record<string, unknown>, tagMap: Map<number, string[]>): IdeaListItem {
  const id = row.id as number;
  return {
    id,
    title: (row.title as string) ?? null,
    excerpt: (row.excerpt as string) ?? null,
    tagIds: tagMap.get(id) ?? [],
    createdAt: new Date(row.created_at as number),
    updatedAt: new Date(row.updated_at as number),
  };
}

export async function getIdeas(
  userId: string,
  options: GetIdeasOptions = {},
): Promise<IdeaListItem[]> {
  const { conditions, params, joinClause } = buildIdeasQuery(userId, options);

  const sql = `
    SELECT i.id, i.title, i.excerpt, i.created_at, i.updated_at
    FROM ideas i
    ${joinClause}
    WHERE ${conditions.join(' AND ')}
    ORDER BY i.created_at DESC
  `;

  const rows = await executeD1Query<Record<string, unknown>>(sql, params);
  const ideaIds = rows.map(r => r.id as number);
  const tagMap = await getIdeaTagMap(ideaIds);

  return rows.map(row => rowToListItem(row, tagMap));
}

export async function getIdeasPage(
  userId: string,
  options: GetIdeasOptions & { limit: number; offset: number },
): Promise<{ items: IdeaListItem[]; total: number }> {
  const { limit, offset, ...filterOptions } = options;
  const { conditions, params, joinClause } = buildIdeasQuery(userId, filterOptions);
  const whereClause = conditions.join(' AND ');

  const countSql = `
    SELECT COUNT(DISTINCT i.id) as cnt FROM ideas i
    ${joinClause}
    WHERE ${whereClause}
  `;

  const selectSql = `
    SELECT i.id, i.title, i.excerpt, i.created_at, i.updated_at
    FROM ideas i
    ${joinClause}
    WHERE ${whereClause}
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const results = await executeD1Batch<Record<string, unknown>>([
    { sql: countSql, params: [...params] },
    { sql: selectSql, params: [...params, limit, offset] },
  ]);

  const countRows = results[0] ?? [];
  const dataRows = results[1] ?? [];
  const total = (countRows[0]?.cnt as number) ?? 0;
  const ideaIds = dataRows.map(r => r.id as number);
  const tagMap = await getIdeaTagMap(ideaIds);

  const items = dataRows.map(row => rowToListItem(row, tagMap));
  return { items, total };
}

export async function getIdeaById(userId: string, id: number): Promise<IdeaDetail | null> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'SELECT * FROM ideas WHERE id = ? AND user_id = ? LIMIT 1',
    [id, userId],
  );
  if (!rows[0]) return null;

  const idea = rowToIdea(rows[0]);
  const tagMap = await getIdeaTagMap([id]);

  return {
    id: idea.id,
    title: idea.title,
    excerpt: idea.excerpt,
    content: idea.content,
    tagIds: tagMap.get(id) ?? [],
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
  };
}

async function validateTagIds(userId: string, tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return;
  const placeholders = tagIds.map(() => '?').join(', ');
  const validTags = await executeD1Query<{ id: string }>(
    `SELECT id FROM tags WHERE user_id = ? AND id IN (${placeholders})`,
    [userId, ...tagIds],
  );
  if (validTags.length !== tagIds.length) {
    const validIds = new Set(validTags.map(t => t.id));
    const invalid = tagIds.filter(tid => !validIds.has(tid));
    throw new Error(`Invalid tag IDs: ${invalid.join(', ')}`);
  }
}

/**
 * Create a new idea with tag binding.
 *
 * D1 batch() cannot share variables across statements, so we:
 * 1. Pre-validate tagIds belong to user
 * 2. Insert the idea and get its ID via RETURNING
 * 3. Batch-insert tag bindings with the concrete ID
 * 4. If step 3 fails, delete the idea (compensating transaction)
 */
export async function createIdea(
  userId: string,
  data: { content: string; title?: string; tagIds?: string[] },
): Promise<IdeaDetail> {
  const now = Date.now();
  const excerpt = generateExcerpt(data.content, 200);
  const tagIds = data.tagIds ?? [];

  await validateTagIds(userId, tagIds);

  const [ideaRow] = await executeD1Query<Record<string, unknown>>(
    `INSERT INTO ideas (user_id, title, content, excerpt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [userId, data.title ?? null, data.content, excerpt, now, now],
  );
  if (!ideaRow) {
    throw new Error('Failed to create idea');
  }
  const idea = rowToIdea(ideaRow);

  if (tagIds.length > 0) {
    try {
      const tagStatements: D1Statement[] = tagIds.map((tagId) => ({
        sql: `INSERT INTO idea_tags (idea_id, tag_id) VALUES (?, ?)`,
        params: [idea.id, tagId],
      }));
      await executeD1Batch(tagStatements);
    } catch (err) {
      console.error('createIdea: tag binding failed, rolling back idea', err);
      await executeD1Query('DELETE FROM ideas WHERE id = ?', [idea.id]);
      throw err;
    }
  }

  return {
    id: idea.id,
    title: idea.title,
    excerpt: idea.excerpt,
    content: idea.content,
    tagIds,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
  };
}

function buildUpdateStatements(
  userId: string,
  id: number,
  data: { title?: string | null; content?: string; tagIds?: string[] },
  now: number,
): D1Statement[] {
  const statements: D1Statement[] = [];
  const setClauses: string[] = ['updated_at = ?'];
  const setParams: unknown[] = [now];

  if (data.title !== undefined) {
    setClauses.push('title = ?');
    setParams.push(data.title);
  }
  if (data.content !== undefined) {
    setClauses.push('content = ?');
    setParams.push(data.content);
    setClauses.push('excerpt = ?');
    setParams.push(generateExcerpt(data.content, 200));
  }

  statements.push({
    sql: `UPDATE ideas SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
    params: [...setParams, id, userId],
  });

  if (data.tagIds !== undefined) {
    statements.push({
      sql: 'DELETE FROM idea_tags WHERE idea_id = ?',
      params: [id],
    });
    for (const tagId of data.tagIds) {
      statements.push({
        sql: 'INSERT INTO idea_tags (idea_id, tag_id) VALUES (?, ?)',
        params: [id, tagId],
      });
    }
  }

  return statements;
}

export async function updateIdea(
  userId: string,
  id: number,
  data: { title?: string | null; content?: string; tagIds?: string[] },
): Promise<IdeaDetail | null> {
  const existing = await getIdeaById(userId, id);
  if (!existing) return null;

  const now = Date.now();
  const tagIds = data.tagIds;

  if (tagIds && tagIds.length > 0) {
    await validateTagIds(userId, tagIds);
  }

  const statements = buildUpdateStatements(userId, id, data, now);
  const results = await executeD1Batch<Record<string, unknown>>(statements);

  const ideaRow = results[0]?.[0];
  if (!ideaRow) return null;

  const idea = rowToIdea(ideaRow);
  return {
    id: idea.id,
    title: idea.title,
    excerpt: idea.excerpt,
    content: idea.content,
    tagIds: tagIds ?? existing.tagIds,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
  };
}

export async function deleteIdea(userId: string, id: number): Promise<boolean> {
  const rows = await executeD1Query<Record<string, unknown>>(
    'DELETE FROM ideas WHERE id = ? AND user_id = ? RETURNING id',
    [id, userId],
  );
  return rows.length > 0;
}

export async function getIdeaTags(userId: string): Promise<IdeaTag[]> {
  const rows = await executeD1Query<Record<string, unknown>>(
    `SELECT it.* FROM idea_tags it
     JOIN ideas i ON it.idea_id = i.id
     WHERE i.user_id = ?`,
    [userId],
  );
  return rows.map(rowToIdeaTag);
}
