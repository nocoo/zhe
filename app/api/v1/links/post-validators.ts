/**
 * Validation helpers for POST /api/v1/links — extracted to keep the route
 * handler small. Each helper returns either the validated value or a
 * NextResponse error to short-circuit.
 */

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/auth";
import { slugExists } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/slug";
import { ScopedDB } from "@/lib/db/scoped";

/** Validate url field is a string and parses as a URL. */
export function validateUrl(value: unknown): NextResponse | string {
  if (!value || typeof value !== "string") {
    return apiError("Missing or invalid 'url' field", 400);
  }
  try {
    new URL(value);
  } catch {
    return apiError("Invalid URL format", 400);
  }
  return value;
}

/**
 * Resolve the slug: either validate the provided custom slug (and check
 * availability) or generate a unique random one. Returns the chosen slug
 * along with whether it is custom.
 */
export async function resolveSlug(
  rawSlug: unknown,
): Promise<NextResponse | { slug: string; isCustom: boolean }> {
  if (rawSlug === undefined) {
    return { slug: await generateUniqueSlug(slugExists), isCustom: false };
  }
  if (typeof rawSlug !== "string") {
    return apiError("'slug' must be a string", 400);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(rawSlug)) {
    return apiError(
      "Invalid slug format. Use only letters, numbers, hyphens, and underscores.",
      400,
    );
  }
  if (rawSlug.length < 3 || rawSlug.length > 50) {
    return apiError("Slug must be between 3 and 50 characters", 400);
  }
  if (await slugExists(rawSlug)) {
    return apiError("Slug already in use", 409);
  }
  return { slug: rawSlug, isCustom: true };
}

/** Validate folderId is a string and references an existing folder, if provided. */
export async function validateFolderId(
  db: ScopedDB,
  value: unknown,
): Promise<NextResponse | null> {
  if (value === undefined) return null;
  if (typeof value !== "string") {
    return apiError("'folderId' must be a string", 400);
  }
  const folder = await db.getFolderById(value);
  if (!folder) return apiError("Folder not found", 404);
  return null;
}

/** Parse expiresAt as ISO 8601, returning null when absent or the Date / error. */
export function parseExpiresAt(value: unknown): NextResponse | Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    return apiError("'expiresAt' must be a string (ISO 8601 format)", 400);
  }
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return apiError("Invalid expiresAt format. Use ISO 8601.", 400);
  }
  if (parsed.getTime() <= Date.now()) {
    return apiError("Expiration date must be in the future", 400);
  }
  return parsed;
}

/** Validate note is string-or-null when provided. */
export function validateNote(value: unknown): NextResponse | null {
  if (value !== undefined && value !== null && typeof value !== "string") {
    return apiError("'note' must be a string or null", 400);
  }
  return null;
}
