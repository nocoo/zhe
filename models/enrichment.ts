import type { ActionResult } from '@/actions/links';

// ---------------------------------------------------------------------------
// Link Enrichment Strategy — decouples URL-specific metadata logic from
// the core link CRUD layer.
//
// Each strategy declares which URLs it can handle. On link creation,
// `enrichLink()` walks the registry in order and delegates to the first
// matching strategy. The default HTML metadata scraper is always registered
// as the final fallback.
// ---------------------------------------------------------------------------

/**
 * A pluggable strategy for enriching newly created links with metadata,
 * screenshots, or other side-effects.
 *
 * Strategies run as fire-and-forget on creation (`enrich`) and as an
 * awaited call on manual refresh (`refresh`).
 */
export interface LinkEnrichmentStrategy {
  /** Human-readable name for logging / debugging. */
  readonly name: string;

  /** Return true if this strategy should handle the given URL. */
  canHandle(url: string): boolean;

  /**
   * Enrich a newly created link (fire-and-forget on creation).
   * Called from `createLink()` — failures are logged but never surface
   * to the user.
   *
   * @param url       - The original URL of the link.
   * @param linkId    - The DB id of the newly created link.
   * @param userId    - The authenticated user's id.
   */
  enrich(url: string, linkId: number, userId: string): Promise<void>;

  /**
   * Force-refresh metadata for an existing link.
   * Called from `refreshLinkMetadata()` — the result is returned to the
   * caller so errors can be surfaced.
   *
   * @param url       - The original URL of the link.
   * @param linkId    - The DB id of the link.
   * @param userId    - The authenticated user's id.
   */
  refresh(url: string, linkId: number, userId: string): Promise<ActionResult>;
}
