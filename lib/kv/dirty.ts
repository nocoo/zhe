/**
 * KV dirty flag — tracks whether any KV mutation has occurred since
 * the last full sync. Lives in its own module to avoid circular
 * dependencies between client.ts and sync.ts.
 *
 * Starts `true` so the first cron after a deploy always performs a
 * full sync (cold-start consistency guarantee).
 */

let dirty = true;

/** Mark KV as dirty — called automatically by kvPutLink / kvDeleteLink. */
export function markKVDirty(): void {
  dirty = true;
}

/** Check whether KV has pending changes. */
export function isKVDirty(): boolean {
  return dirty;
}

/** Clear the dirty flag after a successful full sync. */
export function clearKVDirty(): void {
  dirty = false;
}

/**
 * Reset dirty flag to a specific value (for testing only).
 * @internal
 */
export function _resetDirtyFlag(value: boolean): void {
  dirty = value;
}
