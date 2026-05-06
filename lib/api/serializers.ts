/**
 * Shared API response serializers.
 *
 * These functions transform domain models into the JSON response shapes
 * expected by API consumers. Each converts Date objects to ISO strings.
 */

import type { Link, Tag, Upload } from "@/lib/db/schema";
import type { IdeaDetail, IdeaListItem } from "@/lib/db/scoped";

/** Transform a Link to API response format. */
export function linkToResponse(link: Link): Record<string, unknown> {
  return {
    id: link.id,
    slug: link.slug,
    originalUrl: link.originalUrl,
    shortUrl: `https://zhe.to/${link.slug}`,
    folderId: link.folderId,
    isCustom: link.isCustom,
    clicks: link.clicks,
    note: link.note,
    metaTitle: link.metaTitle,
    metaDescription: link.metaDescription,
    screenshotUrl: link.screenshotUrl,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  };
}

/** Transform an IdeaListItem to API response format. */
export function ideaListItemToResponse(idea: IdeaListItem): Record<string, unknown> {
  return {
    id: idea.id,
    title: idea.title,
    excerpt: idea.excerpt,
    tagIds: idea.tagIds,
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
  };
}

/** Transform an IdeaDetail to API response format. */
export function ideaDetailToResponse(idea: IdeaDetail): Record<string, unknown> {
  return {
    id: idea.id,
    title: idea.title,
    content: idea.content,
    excerpt: idea.excerpt,
    tagIds: idea.tagIds,
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
  };
}

/** Transform a Tag to API response format. */
export function tagToResponse(tag: Tag): Record<string, unknown> {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt.toISOString(),
  };
}

/** Transform an Upload to API response format. */
export function uploadToResponse(upload: Upload): Record<string, unknown> {
  return {
    id: upload.id,
    key: upload.key,
    fileName: upload.fileName,
    fileType: upload.fileType,
    fileSize: upload.fileSize,
    publicUrl: upload.publicUrl,
    createdAt: upload.createdAt.toISOString(),
  };
}
