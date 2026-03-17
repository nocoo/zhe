/**
 * Module-level dirty flag for D1 → KV sync tracking.
 *
 * Indicates that D1 has been mutated and KV may be stale. Called at D1
 * mutation call sites (link create/update/delete), NOT in the KV client.
 * This ensures that even if the inline KV write fails, the cron-based
 * full sync will run as a compensating reconciliation.
 *
 * Starts dirty (true) for cold-start consistency — the first sync after
 * server start always runs a full D1 → KV reconciliation. Subsequent
 * syncs skip when no mutations have occurred since the last successful sync.
 */

let dirty = true;

/** Mark KV as dirty — called after a successful KV write/delete. */
export function markKVDirty(): void {
  dirty = true;
}

/** Check whether any KV mutations have occurred since the last sync. */
export function isKVDirty(): boolean {
  return dirty;
}

/** Clear the dirty flag — called after a successful full sync. */
export function clearKVDirty(): void {
  dirty = false;
}

/** Reset the dirty flag to a specific value (test-only). */
export function _resetDirtyFlag(value: boolean): void {
  dirty = value;
}
