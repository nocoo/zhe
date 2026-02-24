// Pure business logic for settings operations — no React, no DOM.

import type { Link } from "./types";

// ============================================
// Preview style
// ============================================

/** Available preview image rendering modes */
export type PreviewStyle = "favicon" | "screenshot";

/** All valid preview style values */
export const PREVIEW_STYLES: PreviewStyle[] = ["favicon", "screenshot"];

/** Default preview style for new users */
export const DEFAULT_PREVIEW_STYLE: PreviewStyle = "favicon";

/**
 * Build a favicon.im URL for the given original link URL.
 * Returns `null` if the URL is invalid or cannot be parsed.
 */
export function buildFaviconUrl(originalUrl: string): string | null {
  try {
    const { hostname } = new URL(originalUrl);
    if (!hostname) return null;
    return `https://favicon.im/${hostname}?larger=true`;
  } catch {
    return null;
  }
}

/**
 * Validate that a string is a valid PreviewStyle.
 * Returns the validated value or the default if invalid.
 */
export function parsePreviewStyle(value: unknown): PreviewStyle {
  if (value === "favicon" || value === "screenshot") return value;
  return DEFAULT_PREVIEW_STYLE;
}

/** Current backup schema version. Bump when the backup format changes. */
export const BACKUP_SCHEMA_VERSION = 2;

/** Exported link shape — includes all meaningful fields for backup */
export interface ExportedLink {
  originalUrl: string;
  slug: string;
  isCustom: boolean;
  clicks: number;
  createdAt: string; // ISO 8601
  folderId: string | null;
  expiresAt: string | null; // ISO 8601
  metaTitle: string | null;
  metaDescription: string | null;
  metaFavicon: string | null;
  screenshotUrl: string | null;
  note: string | null;
}

/** Exported link-tag association */
export interface ExportedLinkTag {
  linkId: number;
  tagId: string;
}

/** Top-level backup envelope */
export interface BackupEnvelope {
  schemaVersion: number;
  exportedAt: string; // ISO 8601
  links: ExportedLink[];
  folders: Array<{ id: string; name: string; icon: string; createdAt: string }>;
  tags: Array<{ id: string; name: string; color: string; createdAt: string }>;
  linkTags: ExportedLinkTag[];
}

/** Serialize links for JSON export, including all meaningful fields */
export function serializeLinksForExport(links: Link[]): ExportedLink[] {
  return links.map((link) => ({
    originalUrl: link.originalUrl,
    slug: link.slug,
    isCustom: link.isCustom ?? false,
    clicks: link.clicks ?? 0,
    createdAt: new Date(link.createdAt).toISOString(),
    folderId: link.folderId ?? null,
    expiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString() : null,
    metaTitle: link.metaTitle ?? null,
    metaDescription: link.metaDescription ?? null,
    metaFavicon: link.metaFavicon ?? null,
    screenshotUrl: link.screenshotUrl ?? null,
    note: link.note ?? null,
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
      folderId: typeof entry.folderId === "string" ? entry.folderId : null,
      expiresAt: typeof entry.expiresAt === "string" ? entry.expiresAt : null,
      metaTitle: typeof entry.metaTitle === "string" ? entry.metaTitle : null,
      metaDescription: typeof entry.metaDescription === "string" ? entry.metaDescription : null,
      metaFavicon: typeof entry.metaFavicon === "string" ? entry.metaFavicon : null,
      screenshotUrl: typeof entry.screenshotUrl === "string" ? entry.screenshotUrl : null,
      note: typeof entry.note === "string" ? entry.note : null,
    });
  }

  return { success: true, data: parsed };
}
