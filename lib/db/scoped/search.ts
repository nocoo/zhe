import {
  buildSearchDocument,
  normalizeSearchText,
  SEARCH_SOURCES,
  type SearchDocument,
  type SearchFilter,
  type SearchInput,
  type SearchKind,
  type SearchResponse,
  searchProjection,
  toSearchHit,
} from "@/models/search";
import { executeD1Batch, executeD1Query } from "../d1-client";

interface DirtyRow {
  kind: SearchKind;
  resource_id: number;
  revision: number;
}
type Row = Record<string, unknown> & { id: number; created_at: number };
function json(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function tags(value: unknown): string[] {
  const parsed = json(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

/** Source URL and tenant joins prevent old or foreign enrichment from entering the index. */
export async function loadSearchDocuments(
  userId: string,
  kind: SearchKind,
  ids: number[],
): Promise<SearchDocument[]> {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  let sql: string;
  if (kind === "link") {
    sql = `SELECT l.*,f.name AS folder_name,x.result_json AS x_json,x.state AS x_state,
      g.result_json AS github_json,g.state AS github_state,
      (SELECT json_group_array(t.name) FROM link_tags lt JOIN tags t ON t.id=lt.tag_id AND t.user_id=l.user_id WHERE lt.link_id=l.id) AS tags_json
      FROM links l LEFT JOIN folders f ON f.id=l.folder_id AND f.user_id=l.user_id
      LEFT JOIN x_bookmarks x ON x.link_id=l.id AND x.user_id=l.user_id AND x.source_url=l.original_url
      LEFT JOIN github_bookmarks g ON g.link_id=l.id AND g.user_id=l.user_id AND g.source_url=l.original_url
      WHERE l.user_id=? AND l.id IN (${placeholders})`;
  } else if (kind === "idea") {
    sql = `SELECT i.*,(SELECT json_group_array(t.name) FROM idea_tags it JOIN tags t ON t.id=it.tag_id AND t.user_id=i.user_id WHERE it.idea_id=i.id) AS tags_json FROM ideas i WHERE i.user_id=? AND i.id IN (${placeholders})`;
  } else {
    sql = `SELECT t.*,(SELECT json_group_array(name) FROM todo_tags WHERE todo_id=t.id) AS tags_json FROM todos t WHERE t.user_id=? AND t.id IN (${placeholders})`;
  }
  const rows = await executeD1Query<Row>(sql, [userId, ...ids]);
  return rows.map((row) => {
    const capture = json(row.x_json) as { tweet?: unknown } | null;
    const input: SearchInput = {
      kind,
      id: row.id,
      createdAt: row.created_at,
      tags: tags(row.tags_json),
    };
    if (kind === "link")
      Object.assign(input, {
        title: row.title || row.meta_title,
        originalTitle: row.meta_title,
        url: row.original_url,
        slug: row.slug,
        description: row.meta_description,
        note: row.note,
        favicon: row.meta_favicon,
        folderName: row.folder_name,
        folderId: row.folder_id,
        tweet: capture?.tweet,
        repository: json(row.github_json),
        state: row.x_state ?? row.github_state,
      });
    else
      Object.assign(input, {
        title: row.title,
        content: row.content,
        excerpt: row.excerpt,
        done: Boolean(row.done),
        emoji: row.emoji,
      });
    return buildSearchDocument(input);
  });
}

const rebuilding = new Map<string, Promise<void>>();

/** Only dirty rows are projected. CAS keeps a concurrent source update dirty for another pass. */
export class SearchIndexPendingError extends Error {
  constructor() {
    super("Search index is updating; retry shortly");
  }
}
async function rebuild(userId: string): Promise<void> {
  const started = Date.now();
  for (let round = 0; round < 32 && Date.now() - started < 8_000; round++) {
    const rows = await executeD1Query<DirtyRow>(
      `SELECT kind,resource_id,revision FROM search_documents WHERE user_id=? AND indexed_revision<>revision ORDER BY kind,resource_id LIMIT 4`,
      [userId],
    );
    if (!rows.length) return;
    const documents: SearchDocument[] = [];
    for (const kind of ["link", "idea", "todo"] as const) {
      const ids = rows.filter((row) => row.kind === kind).map((row) => row.resource_id);
      // Four full README snapshots stay within the proxy's response budget.
      for (let at = 0; at < ids.length; at += 4)
        documents.push(...(await loadSearchDocuments(userId, kind, ids.slice(at, at + 4))));
    }
    const statements = documents.map((document) => {
      const row = rows.find(
        (item) => item.kind === document.kind && item.resource_id === document.id,
      );
      const projection = searchProjection(document);
      return {
        sql: `UPDATE search_documents SET source=?,search_text=?,titles=?,identities=?,metadata=?,summaries=?,indexed_revision=? WHERE user_id=? AND kind=? AND resource_id=? AND revision=?`,
        params: [
          projection.source,
          projection.text,
          projection.titles,
          projection.identities,
          projection.metadata,
          projection.summaries,
          row?.revision,
          userId,
          document.kind,
          document.id,
          row?.revision,
        ],
      };
    });
    if (statements.length) await executeD1Batch(statements);
    // Source deletion may race hydration; delete only confirmed orphans for this user.
    if (documents.length < rows.length)
      await executeD1Query(
        `DELETE FROM search_documents WHERE user_id=? AND (
      (kind='link' AND NOT EXISTS(SELECT 1 FROM links l WHERE l.id=resource_id AND l.user_id=search_documents.user_id)) OR
      (kind='idea' AND NOT EXISTS(SELECT 1 FROM ideas i WHERE i.id=resource_id AND i.user_id=search_documents.user_id)) OR
      (kind='todo' AND NOT EXISTS(SELECT 1 FROM todos t WHERE t.id=resource_id AND t.user_id=search_documents.user_id)))`,
        [userId],
      );
  }
  throw new SearchIndexPendingError();
}

export async function ensureSearchIndex(userId: string): Promise<void> {
  const existing = rebuilding.get(userId);
  if (existing) return existing;
  const work = rebuild(userId).finally(() => rebuilding.delete(userId));
  rebuilding.set(userId, work);
  return work;
}

export function searchRankSql(alias = "s"): string {
  return `CASE
    WHEN instr(char(10)||${alias}.titles||char(10),char(10)||?||char(10))>0 THEN 0
    WHEN instr(char(10)||${alias}.titles,char(10)||?)>0 THEN 1
    WHEN instr(${alias}.titles,?)>0 THEN 2
    WHEN instr(${alias}.identities,?)>0 THEN 3
    WHEN instr(${alias}.metadata,?)>0 THEN 4
    WHEN instr(${alias}.summaries,?)>0 THEN 5 ELSE 6 END`;
}

export async function searchResources(
  userId: string,
  query: string,
  source: SearchFilter = "all",
  limit = 20,
  offset = 0,
  retries = 2,
): Promise<SearchResponse> {
  const needle = normalizeSearchText(query);
  const counts = Object.fromEntries(
    SEARCH_SOURCES.map((key) => [key, 0]),
  ) as SearchResponse["counts"];
  if (!needle) return { query, items: [], total: 0, counts, limit, offset };
  await ensureSearchIndex(userId);
  const where = "s.user_id=? AND s.indexed_revision=s.revision AND instr(s.search_text,?)>0";
  const results = await executeD1Batch<Record<string, unknown>>([
    {
      sql: `SELECT s.source,COUNT(*) AS count FROM search_documents s WHERE ${where} GROUP BY s.source`,
      params: [userId, needle],
    },
    {
      sql: `SELECT s.kind,s.resource_id,${searchRankSql()} AS rank FROM search_documents s WHERE ${where}${source === "all" ? "" : " AND s.source=?"} ORDER BY rank,s.created_at DESC,s.kind,s.resource_id DESC LIMIT ? OFFSET ?`,
      params: [
        ...Array(6).fill(needle),
        userId,
        needle,
        ...(source === "all" ? [] : [source]),
        limit,
        offset,
      ],
    },
    {
      sql: "SELECT 1 AS dirty FROM search_documents WHERE user_id=? AND indexed_revision<>revision LIMIT 1",
      params: [userId],
    },
  ]);
  for (const row of results[0] ?? [])
    if (SEARCH_SOURCES.includes(row.source as SearchDocument["source"]))
      counts[row.source as SearchDocument["source"]] = Number(row.count);
  const selected = (results[1] ?? []) as unknown as (DirtyRow & { rank: number })[];
  const documents: SearchDocument[] = [];
  for (const kind of ["link", "idea", "todo"] as const) {
    const ids = selected.filter((row) => row.kind === kind).map((row) => row.resource_id);
    for (let at = 0; at < ids.length; at += 4)
      documents.push(...(await loadSearchDocuments(userId, kind, ids.slice(at, at + 4))));
  }
  const byId = new Map(documents.map((document) => [`${document.kind}:${document.id}`, document]));
  const items = selected.flatMap((row) => {
    const document = byId.get(`${row.kind}:${row.resource_id}`);
    const hit = document ? toSearchHit(document, query) : null;
    return hit && hit.score === row.rank && (source === "all" || hit.source === source)
      ? [hit]
      : [];
  });
  // Source changes during hydration must not produce silently missing page rows.
  if (results[2]?.length || items.length !== selected.length) {
    if (retries > 0) return searchResources(userId, query, source, limit, offset, retries - 1);
    throw new SearchIndexPendingError();
  }
  return {
    query,
    items,
    counts,
    total: source === "all" ? Object.values(counts).reduce((sum, n) => sum + n, 0) : counts[source],
    limit,
    offset,
  };
}
