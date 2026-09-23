import { executeD1Batch, executeD1Query } from "@/lib/db/d1-client";
import {
  type EnrichmentEvent,
  type EnrichmentTask,
  enrichmentSource,
} from "@/models/connector-activity";

const TABLES = {
  x: "x_bookmarks",
  github: "github_bookmarks",
  screenshot: "screenshot_jobs",
} as const;

export async function getEnrichmentTasks(userId: string): Promise<EnrichmentTask[]> {
  const rows = await executeD1Query<EnrichmentTask>(
    `${Object.entries(TABLES)
      .map(([source, table]) => {
        const text =
          source === "screenshot"
            ? "0"
            : `COALESCE(length(json_extract(j.result_json,'${source === "x" ? "$.tweet.text" : "$.readme"}')),0)`;
        const mediaCount =
          source === "x"
            ? "(SELECT COUNT(*) FROM x_media m WHERE m.link_id=j.link_id AND m.state='published' AND m.kind<>'poster')"
            : "0";
        const mediaTotal =
          source === "x" ? "COALESCE(json_array_length(j.result_json,'$.tweet.media'),0)" : "0";
        const bytes =
          source === "x"
            ? "(SELECT COALESCE(SUM(size),0) FROM x_media m WHERE m.link_id=j.link_id AND m.state='published')"
            : source === "github"
              ? "COALESCE(length(CAST(json_extract(j.result_json,'$.readme') AS BLOB)),0)"
              : "0";
        return `SELECT j.link_id AS linkId,'${source}' AS source,COALESCE(NULLIF(l.title,''),NULLIF(l.meta_title,''),l.original_url) AS title,
      l.original_url AS url,j.state,j.attempts,j.next_attempt_at AS nextAttemptAt,j.lease_until AS leaseUntil,
      j.updated_at AS updatedAt,j.error_code AS errorCode,k.name AS connectorName,
      ${text} AS textChars,${mediaCount} AS mediaCount,${mediaTotal} AS mediaTotal,${bytes} AS archivedBytes,
      (SELECT COUNT(*) FROM connector_events e WHERE e.user_id=j.user_id AND e.link_id=j.link_id AND e.source='${source}' AND e.kind='finished' AND e.state='failed') AS recordedFailures,
      NOT EXISTS(SELECT 1 FROM connector_events e WHERE e.user_id=j.user_id AND e.link_id=j.link_id AND e.source='${source}' AND e.kind='snapshot' AND e.attempts>0) AS historyComplete,
      l.screenshot_url AS previewUrl FROM ${table} j JOIN links l ON l.id=j.link_id AND l.user_id=j.user_id AND l.original_url=j.source_url
      LEFT JOIN api_keys k ON k.id=j.lease_key_id AND k.user_id=j.user_id WHERE j.user_id=?`;
      })
      .join(" UNION ALL ")} ORDER BY updatedAt DESC,linkId DESC`,
    [userId, userId, userId],
  );
  const undiscovered = await executeD1Query<{
    linkId: number;
    title: string;
    url: string;
    source: string;
    previewUrl: string | null;
    updatedAt: number;
  }>(
    `SELECT l.id AS linkId,COALESCE(NULLIF(l.title,''),NULLIF(l.meta_title,''),l.original_url) AS title,l.original_url AS url,d.source,l.screenshot_url AS previewUrl,l.created_at AS updatedAt
      FROM connector_discovery d JOIN links l ON l.id=d.link_id AND l.user_id=d.user_id WHERE d.user_id=?`,
    [userId],
  );
  const known = new Set(rows.map((row) => row.linkId));
  return [
    ...rows.map((row) => ({ ...row, historyComplete: Boolean(row.historyComplete) })),
    ...undiscovered.flatMap((row) => {
      const source = enrichmentSource(row.url);
      if (
        !source ||
        source !== row.source ||
        known.has(row.linkId) ||
        (source === "screenshot" && row.previewUrl?.trim())
      )
        return [];
      return [
        {
          ...row,
          source,
          state: "pending" as const,
          attempts: 0,
          nextAttemptAt: 0,
          leaseUntil: 0,
          errorCode: null,
          connectorName: null,
          textChars: 0,
          mediaCount: 0,
          mediaTotal: 0,
          archivedBytes: 0,
          recordedFailures: 0,
          historyComplete: true,
        },
      ];
    }),
  ].sort((a, b) => b.updatedAt - a.updatedAt || b.linkId - a.linkId);
}

export async function getEnrichmentEvents(userId: string, linkId: number, before: number) {
  const rows = await executeD1Query<EnrichmentEvent>(
    `SELECT id,source,kind,state,attempts,error_code AS errorCode,connector_name AS connectorName,
      text_chars AS textChars,media_count AS mediaCount,media_total AS mediaTotal,archived_bytes AS archivedBytes,created_at AS createdAt
      FROM connector_events WHERE user_id=? AND link_id=? AND id<? ORDER BY id DESC LIMIT 51`,
    [userId, linkId, before],
  );
  return { events: rows.slice(0, 50), more: rows.length > 50 };
}

export async function retryEnrichmentTasks(userId: string, ids: number[], now = Date.now()) {
  const selected = [...new Set(ids)];
  if (!selected.length) return [];
  const links = await executeD1Query<{ id: number; original_url: string }>(
    `SELECT id,original_url FROM links WHERE user_id=? AND id IN (${selected.map(() => "?").join(",")})`,
    [userId, ...selected],
  );
  const statements = links.flatMap((link) => {
    const source = enrichmentSource(link.original_url);
    if (!source) return [];
    const table = TABLES[source];
    return [
      {
        sql: `UPDATE ${table} SET state='pending',attempts=0,next_attempt_at=0,lease_until=0,error_code=NULL,updated_at=?
        ${source === "x" ? ",draft_json=NULL" : ""}
        WHERE link_id=? AND user_id=? AND source_url=?
          AND (state IN ('failed','partial','unavailable') OR (state='running' AND lease_until<=?))
          ${source === "screenshot" ? "AND EXISTS(SELECT 1 FROM links WHERE id=screenshot_jobs.link_id AND user_id=screenshot_jobs.user_id AND (screenshot_url IS NULL OR trim(screenshot_url)=''))" : ""}
        RETURNING link_id AS linkId`,
        params: [now, link.id, userId, link.original_url, now],
      },
    ];
  });
  return (await executeD1Batch<{ linkId: number }>(statements, { connectorUserId: userId }))
    .flat()
    .map((row) => row.linkId);
}
