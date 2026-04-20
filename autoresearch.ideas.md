# Autoresearch ideas (deferred / candidate optimizations)

## Active backlog for L2 + L3 + Worker bench

- Pre-build `.next` once before the bench (L3 webServer) and reuse via custom command, eliminating turbopack first-route compile cost (~5-10s on cold runs).
- Switch L3 from `next dev --turbopack` to `next start` after pre-building. Requires a docker-cached or persisted `.next/` between hook runs.
- Move per-route `networkidle` waits in long L3 specs (backy/data-management/folders/webhook/xray) to a deterministic locator wait. Risk: introduces flake.
- Move L3 `webServer` to `webServer.command: 'bun next dev --turbopack -p 27006'` (skip `bun run` script overhead).
- Persist Playwright `.auth/user.json` between bench runs and skip the auth.setup project entirely (requires storageState validity check).
- Consider switching to a single shared dev server for L2 + L3 (currently runs two server processes back-to-back).
- Split webhook.test.ts (15 tests, 11s) into HEAD/GET vs POST groups for L2 file-level parallelism.
- Investigate whether `it.concurrent` works under `vitest 4` for the read-only Authentication blocks (prior session noted catastrophic D1 contention; may have improved with isolate=false).
- Investigate `vitest --reporter=basic` to skip default reporter overhead in L2.
