// Pure type definitions — no React, no server dependencies.
// Re-exports DB schema types for convenience and adds UI-specific types.

import type { Link as DBLink } from "@/lib/db/schema";

/** Link type re-exported from schema */
export type Link = DBLink;

/** Analytics breakdown for a single link */
export interface AnalyticsStats {
  totalClicks: number;
  uniqueCountries: string[];
  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
}

/** Input for creating a new link */
export interface CreateLinkInput {
  originalUrl: string;
  customSlug?: string;
  folderId?: string;
  expiresAt?: Date;
}

/** Generic server action result */
export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Sidebar navigation item */
export interface NavItem {
  title: string;
  icon: React.ElementType;
  href: string;
  badge?: number;
}

/** Sidebar navigation group */
export interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}
