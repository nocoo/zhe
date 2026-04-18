# Autoresearch ideas (deferred / candidate optimizations)

- Use `next build && next start` for L2 (avoids per-route lazy compile in dev). Need to verify NextAuth + PLAYWRIGHT credentials provider work in prod mode.
- Pre-warm routes by issuing HEAD requests to every endpoint the suite touches before tests start.
- Enable `fileParallelism: true` in `vitest.api.config.ts` after isolating shared D1 state per file (per-file user + per-file slug prefix).
- Replace `cleanupTestData` blanket DELETEs with per-test scoped cleanup keyed by a unique run/test prefix to allow parallel files.
- Persist `.next` build cache between hook runs to skip turbopack warm-up.
- Switch coverage provider from v8 to istanbul/native and/or limit instrumentation scope further.
- Run `osv-scanner` weekly (CI) instead of every push, rely on dependabot.
