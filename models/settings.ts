// Pure business logic for settings operations — no React, no DOM.

import type { Link } from "./types";

/** Exported link shape — stripped of internal fields */
export interface ExportedLink {
  originalUrl: string;
  slug: string;
  isCustom: boolean;
  clicks: number;
  createdAt: string; // ISO 8601
}

/** Serialize links for JSON export, stripping internal fields */
export function serializeLinksForExport(links: Link[]): ExportedLink[] {
  return links.map((link) => ({
    originalUrl: link.originalUrl,
    slug: link.slug,
    isCustom: link.isCustom ?? false,
    clicks: link.clicks ?? 0,
    createdAt: new Date(link.createdAt).toISOString(),
  }));
}

/** Result of parsing an import payload */
interface ParseResult {
  success: boolean;
  data?: ExportedLink[];
  error?: string;
}

/** Parse and validate an import payload (unknown JSON) */
export function parseImportPayload(payload: unknown): ParseResult {
  if (!Array.isArray(payload)) {
    return { success: false, error: "导入数据必须是数组" };
  }

  if (payload.length === 0) {
    return { success: false, error: "导入数据不能为空" };
  }

  const parsed: ExportedLink[] = [];

  for (let i = 0; i < payload.length; i++) {
    const entry = payload[i];
    const index = i + 1; // 1-indexed for user-facing errors

    if (!entry || typeof entry !== "object") {
      return { success: false, error: `第 #${index} 条数据格式无效` };
    }

    if (!entry.originalUrl || typeof entry.originalUrl !== "string") {
      return {
        success: false,
        error: `第 #${index} 条缺少 originalUrl 字段`,
      };
    }

    if (!entry.slug || typeof entry.slug !== "string") {
      return { success: false, error: `第 #${index} 条缺少 slug 字段` };
    }

    // Validate URL
    try {
      new URL(entry.originalUrl);
    } catch {
      return {
        success: false,
        error: `第 #${index} 条 originalUrl 不是有效的 URL`,
      };
    }

    parsed.push({
      originalUrl: entry.originalUrl,
      slug: entry.slug,
      isCustom: typeof entry.isCustom === "boolean" ? entry.isCustom : false,
      clicks: typeof entry.clicks === "number" ? entry.clicks : 0,
      createdAt: entry.createdAt ?? new Date().toISOString(),
    });
  }

  return { success: true, data: parsed };
}
