import { type D1Statement, executeD1Batch } from "../d1-client";
import { rowToLink, rowToTag } from "../mappers";

export interface LinkOrganizationInput {
  linkId: number;
  revision: number;
  title: string;
  note: string;
  folderId: string | null;
  tagIds: string[];
}

/** The revision assertion and every mutation execute in one D1 transaction. */
export async function saveLinkOrganization(userId: string, input: LinkOrganizationInput) {
  if (
    !Number.isSafeInteger(input.linkId) ||
    input.linkId <= 0 ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    typeof input.title !== "string" ||
    Array.from(input.title.trim()).length > 32 ||
    typeof input.note !== "string" ||
    (input.folderId !== null && typeof input.folderId !== "string") ||
    !Array.isArray(input.tagIds) ||
    input.tagIds.length > 100 ||
    input.tagIds.some((id) => typeof id !== "string" || !id.trim())
  )
    throw new Error("整理内容格式无效");
  const tagIds = [...new Set(input.tagIds)];
  const selected = JSON.stringify(tagIds);
  const statements: D1Statement[] = [
    {
      sql: `SELECT CASE WHEN EXISTS(
      SELECT 1 FROM links l JOIN search_documents s ON s.resource_id=l.id AND s.kind='link' AND s.user_id=l.user_id
      WHERE l.id=? AND l.user_id=? AND s.revision=?
      AND (? IS NULL OR EXISTS(SELECT 1 FROM folders WHERE id=? AND user_id=?))
      AND (SELECT COUNT(*) FROM tags WHERE user_id=? AND id IN (SELECT value FROM json_each(?)))=?
    ) THEN 1 ELSE json('organization_conflict') END`,
      params: [
        input.linkId,
        userId,
        input.revision,
        input.folderId,
        input.folderId,
        userId,
        userId,
        selected,
        tagIds.length,
      ],
    },
    {
      sql: "UPDATE links SET title=?,note=?,folder_id=? WHERE id=? AND user_id=? RETURNING *",
      params: [
        input.title.trim() || null,
        input.note.trim() || null,
        input.folderId,
        input.linkId,
        userId,
      ],
    },
    {
      sql: "DELETE FROM link_tags WHERE link_id=? AND EXISTS(SELECT 1 FROM links WHERE id=? AND user_id=?)",
      params: [input.linkId, input.linkId, userId],
    },
  ];
  statements.push({
    sql: "INSERT INTO link_tags(link_id,tag_id) SELECT ?,id FROM tags WHERE user_id=? AND id IN (SELECT value FROM json_each(?))",
    params: [input.linkId, userId, selected],
  });
  statements.push({
    sql: `SELECT t.* FROM tags t JOIN link_tags lt ON lt.tag_id=t.id WHERE lt.link_id=? AND t.user_id=?`,
    params: [input.linkId, userId],
  });
  const results = await executeD1Batch<Record<string, unknown>>(statements);
  const row = results[1]?.[0];
  if (!row) throw new Error("链接不存在");
  return { link: rowToLink(row), tags: (results.at(-1) ?? []).map(rowToTag) };
}
