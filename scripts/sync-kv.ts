#!/usr/bin/env bun
/**
 * Manual full D1 → KV sync script.
 *
 * Reads all links from D1 and bulk-writes them to Cloudflare KV.
 * Useful for initial population, disaster recovery, or verifying consistency.
 *
 * Required env vars (reads from .env.local automatically via Bun):
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_KV_NAMESPACE_ID
 *   CLOUDFLARE_D1_DATABASE_ID
 *
 * Usage:
 *   bun run sync-kv            # run full sync
 *   bun run sync-kv --dry-run  # fetch links but skip KV writes
 */

import { getAllLinksForKV } from '../lib/db';
import { kvBulkPutLinks, isKVConfigured } from '../lib/kv/client';

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('=== D1 → KV Full Sync ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log();

  // 1. Check KV configuration
  if (!isKVConfigured()) {
    console.error(
      'Error: KV not configured. Ensure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, ' +
        'and CLOUDFLARE_KV_NAMESPACE_ID are set.',
    );
    process.exit(1);
  }
  console.log('KV credentials: OK');

  // 2. Fetch all links from D1
  console.log('Fetching links from D1...');
  const startFetch = Date.now();
  let links: Awaited<ReturnType<typeof getAllLinksForKV>>;
  try {
    links = await getAllLinksForKV();
  } catch (err) {
    console.error('Failed to fetch links from D1:', err);
    process.exit(1);
  }
  const fetchDurationMs = Date.now() - startFetch;
  console.log(`Fetched ${links.length} links from D1 (${fetchDurationMs}ms)`);

  if (links.length === 0) {
    console.log('No links to sync. Done.');
    process.exit(0);
  }

  // 3. Bulk-write to KV
  if (isDryRun) {
    console.log();
    console.log(`Dry run complete. Would sync ${links.length} links to KV.`);
    console.log('Sample entries:');
    for (const link of links.slice(0, 5)) {
      console.log(`  ${link.slug} → ${link.originalUrl}`);
    }
    if (links.length > 5) {
      console.log(`  ... and ${links.length - 5} more`);
    }
    process.exit(0);
  }

  console.log('Writing to KV...');
  const startWrite = Date.now();
  const entries = links.map((link) => ({
    slug: link.slug,
    data: {
      id: link.id,
      originalUrl: link.originalUrl,
      expiresAt: link.expiresAt,
    },
  }));

  const result = await kvBulkPutLinks(entries);
  const writeDurationMs = Date.now() - startWrite;
  const totalDurationMs = Date.now() - startFetch;

  // 4. Report
  console.log();
  console.log('=== Sync Complete ===');
  console.log(`Total links:  ${links.length}`);
  console.log(`Synced:       ${result.success}`);
  console.log(`Failed:       ${result.failed}`);
  console.log(`Fetch time:   ${fetchDurationMs}ms`);
  console.log(`Write time:   ${writeDurationMs}ms`);
  console.log(`Total time:   ${totalDurationMs}ms`);

  if (result.failed > 0) {
    console.error(`\nWarning: ${result.failed} links failed to sync.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
