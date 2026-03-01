/**
 * Next.js Instrumentation Hook.
 *
 * `register()` runs once when the Next.js server starts (or when a new worker
 * is spawned). We use it to trigger an initial D1 → KV sync so the in-memory
 * cron history buffer is populated immediately after deploy, rather than
 * waiting up to 15 minutes for the first Worker cron trigger.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server runtime (not edge, not build)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { performKVSync } = await import('@/lib/kv/sync');

    // Fire-and-forget: don't block server startup
    void performKVSync().then((result) => {
      if (result.error) {
        console.log(`[instrumentation] startup KV sync skipped: ${result.error}`);
      } else {
        console.log(
          `[instrumentation] startup KV sync: ${result.synced} synced, ${result.failed} failed, ${result.durationMs}ms`,
        );
      }
    });
  }
}
