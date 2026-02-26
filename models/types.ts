// Pure type definitions — no React, no server dependencies.
// Re-exports DB schema types for convenience and adds UI-specific types.

import type { Link as DBLink, Folder as DBFolder, Tag as DBTag, LinkTag as DBLinkTag, UserSettings as DBUserSettings } from "@/lib/db/schema";

/** Link type re-exported from schema */
export type Link = DBLink;

/** Folder type re-exported from schema */
export type Folder = DBFolder;

/** Tag type re-exported from schema */
export type Tag = DBTag;

/** LinkTag junction type re-exported from schema */
export type LinkTag = DBLinkTag;

/** UserSettings type re-exported from schema */
export type UserSettings = DBUserSettings;

/** Analytics breakdown for a single link */
export interface AnalyticsStats {
  totalClicks: number;
  uniqueCountries: string[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
}

