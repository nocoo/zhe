/**
 * Row-to-entity mappers for D1 query results.
 *
 * Shared between index.ts (public unscoped operations) and
 * scoped.ts (ScopedDB user-owned operations) to eliminate duplication.
 */

import type { Link, Analytics, Folder, Upload, Webhook, Tag, LinkTag, UserSettings, ApiKey, Idea, IdeaTag } from './schema';

export function rowToLink(row: Record<string, unknown>): Link {
  return {
    id: row.id as number,
    userId: row.user_id as string,
    folderId: row.folder_id as string | null,
    originalUrl: row.original_url as string,
    slug: row.slug as string,
    isCustom: Boolean(row.is_custom),
    expiresAt: row.expires_at ? new Date(row.expires_at as number) : null,
    clicks: row.clicks as number,
    metaTitle: (row.meta_title as string) ?? null,
    metaDescription: (row.meta_description as string) ?? null,
    metaFavicon: (row.meta_favicon as string) ?? null,
    screenshotUrl: (row.screenshot_url as string) ?? null,
    note: (row.note as string) ?? null,
    createdAt: new Date(row.created_at as number),
  };
}

export function rowToAnalytics(row: Record<string, unknown>): Analytics {
  return {
    id: row.id as number,
    linkId: row.link_id as number,
    country: row.country as string | null,
    city: row.city as string | null,
    device: row.device as string | null,
    browser: row.browser as string | null,
    os: row.os as string | null,
    referer: row.referer as string | null,
    source: (row.source as string) ?? null,
    createdAt: new Date(row.created_at as number),
  };
}

export function rowToFolder(row: Record<string, unknown>): Folder {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    icon: (row.icon as string) || 'folder',
    createdAt: new Date(row.created_at as number),
  };
}

export function rowToUpload(row: Record<string, unknown>): Upload {
  return {
    id: row.id as number,
    userId: row.user_id as string,
    key: row.key as string,
    fileName: row.file_name as string,
    fileType: row.file_type as string,
    fileSize: row.file_size as number,
    publicUrl: row.public_url as string,
    createdAt: new Date(row.created_at as number),
  };
}

export function rowToWebhook(row: Record<string, unknown>): Webhook {
  return {
    id: row.id as number,
    userId: row.user_id as string,
    token: row.token as string,
    rateLimit: (row.rate_limit as number) ?? 5,
    createdAt: new Date(row.created_at as number),
  };
}

export function rowToTag(row: Record<string, unknown>): Tag {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    color: row.color as string,
    createdAt: new Date(row.created_at as number),
  };
}

export function rowToLinkTag(row: Record<string, unknown>): LinkTag {
  return {
    linkId: row.link_id as number,
    tagId: row.tag_id as string,
  };
}

export function rowToUserSettings(row: Record<string, unknown>): UserSettings {
  return {
    userId: row.user_id as string,
    previewStyle: row.preview_style as string,
    backyWebhookUrl: (row.backy_webhook_url as string) ?? null,
    backyApiKey: (row.backy_api_key as string) ?? null,
    xrayApiUrl: (row.xray_api_url as string) ?? null,
    xrayApiToken: (row.xray_api_token as string) ?? null,
    backyPullKey: (row.backy_pull_key as string) ?? null,
  };
}

export function rowToApiKey(row: Record<string, unknown>): ApiKey {
  return {
    id: row.id as string,
    prefix: row.prefix as string,
    keyHash: row.key_hash as string,
    userId: row.user_id as string,
    name: row.name as string,
    scopes: row.scopes as string,
    createdAt: new Date(row.created_at as number),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as number) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at as number) : null,
  };
}

export function rowToIdea(row: Record<string, unknown>): Idea {
  return {
    id: row.id as number,
    userId: row.user_id as string,
    title: (row.title as string) ?? null,
    content: row.content as string,
    excerpt: (row.excerpt as string) ?? null,
    createdAt: new Date(row.created_at as number),
    updatedAt: new Date(row.updated_at as number),
  };
}

export function rowToIdeaTag(row: Record<string, unknown>): IdeaTag {
  return {
    ideaId: row.idea_id as number,
    tagId: row.tag_id as string,
  };
}
