README.md

## Versioning

### Single Source of Truth

The **only** authoritative version number lives in `package.json` `"version"` field (format: `1.2.3`).

- **Storage format**: bare semver `1.2.3` (in `package.json`)
- **Display format**: `v1.2.3` (git tags, GitHub releases, CHANGELOG headers, UI/docs)
- All runtime references import `APP_VERSION` from `lib/version.ts`, which reads `package.json` at build time
- **No hardcoded version strings anywhere** — `package.json` is the only place to update
- **Monorepo version sync**: When releasing, `cli/package.json` version must match root `package.json` version. The CLI is published to npm as `@nocoo/zhe`.

### Version References

| File | Role |
|------|------|
| `package.json` | `"version"` field — **the only place to update** |
| `cli/package.json` | Must match root version when releasing CLI to npm |
| `lib/version.ts` | Reads `package.json` and exports `APP_VERSION` |
| `app/api/health/route.ts` | Uses `APP_VERSION` (auto-updated at build time) |
| `app/api/live/route.ts` | Uses `APP_VERSION` (auto-updated at build time) |

All test files assert via `APP_VERSION` import or `toBeDefined()` — no hardcoded version strings.

### Semantic Versioning (SemVer)

Follow strict [SemVer 2.0.0](https://semver.org/):

| Bump | When | Example |
|------|------|---------|
| **major** (X.0.0) | Breaking change to public API, DB schema migration, auth flow change | 1.0.0 -> 2.0.0 |
| **minor** (x.Y.0) | New feature, new API endpoint, new page/module | 1.0.0 -> 1.1.0 |
| **patch** (x.y.Z) | Bug fix, typo, refactor, dependency update, docs/config change | 1.0.0 -> 1.0.1 |

**Default**: If the user does not specify a bump level, default to **patch** (`x.y.Z`).

### Release Workflow

All release steps are automated by `scripts/release.ts`. When the user requests a version bump (do NOT proactively suggest or create version bumps):

```bash
bun run release              # patch bump (default)
bun run release -- minor     # minor bump
bun run release -- major     # major bump
bun run release -- 2.0.0     # explicit version
bun run release -- --dry-run # preview without side effects
bun run release -- --skip-l3 # skip the L3 Playwright preflight
bun run release -- --skip-redeploy
                             # skip the post-push Railway redeploy + health probe
```

**⚠️ Pre-release D1 Probe**: The release script probes prod D1 (`zhe-db`) reachability during preflight — it fails fast if `wrangler` can't reach prod (auth issue, network problem). Prior versions compared prod vs `zhe-db-test`, but L2/L3 now run on a fully local Miniflare stack so the test DB is gone. To apply a missing migration to prod after release:

```bash
# Apply the missing migration to prod
wrangler d1 execute zhe-db --remote --file=drizzle/migrations/00XX_xxx.sql
```

The script performs these steps automatically:
1. Preflight: verify clean working tree, branch, `gh` auth, **prod D1 reachability**
2. **L3 Playwright preflight (hard gate)** — runs `bun run test:e2e:pw` before bumping; aborts if any spec fails. Skip with `--skip-l3` only when the L3 suite is known to be green
3. Bump `package.json` `"version"` field (targeted regex, not naive substring replace)
4. Run `bun install` to sync `bun.lock` (prevents `--frozen-lockfile` failures in CI)
5. Generate CHANGELOG.md section from `git log` (conventional commit classification)
6. Verify no stale old version strings remain in `*.ts`/`*.tsx` via `rg`
7. Commit: `chore: bump version to x.y.z` (triggers pre-commit hooks: L1 + G1 + G2)
8. Push → Tag (`v`-prefixed, annotated) → Push tags → GitHub Release
9. **Force `railway redeploy --from-source --yes` and poll `/api/live`** until version matches (5min cap; warns rather than fails on timeout because the tag is already public). Skip with `--skip-redeploy`

Pre-commit hooks (L1 tests, G1 lint/typecheck, G2 gitleaks) run automatically during step 7. Pre-push hooks (L2 API E2E, G2 osv-scanner) run during step 8.

> **Versioning spec**: `search-memory "开发规范：版本号的维护"` — defines X (major/breaking), Y (minor/feature), Z (patch/fix) and default bump rules.

### CHANGELOG.md Format

Follow [Keep a Changelog](https://keepachangelog.com/) convention:

```markdown
## [vx.y.z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing features

### Fixed
- Bug fixes

### Removed
- Removed features
```

Only include sections that have entries. Use imperative mood ("add", not "added").

## Cloudflare Worker (`worker/`)

The **zhe-edge** Worker sits in front of Railway (origin) as a full proxy for `zhe.to`. It is a standalone Cloudflare Worker project maintained in the `worker/` subdirectory with its own `package.json`, `tsconfig.json`, `wrangler.toml`, and test suite.

### Architecture

```
User → Cloudflare CDN → zhe-edge Worker → Railway (Next.js origin)
                              │
                              ├─ KV hit → 307 redirect + fire-and-forget analytics
                              ├─ KV miss → forward to origin (middleware D1 fallback)
                              ├─ Reserved path → forward to origin
                              └─ Cron (every 30 min) → POST /api/cron/cleanup (tmp file cleanup)
```

### Responsibilities

1. **Edge redirect** — Resolves short links from KV at the edge without hitting D1. On KV hit: 307 redirect + fire-and-forget `POST /api/record-click` for analytics. On KV miss: forward to origin where middleware handles D1 lookup.
2. **Cron trigger** — Every 30 minutes, calls `POST /api/cron/cleanup` on origin to delete expired temporary files from R2. KV sync is handled inline (on each mutation) and on server startup — no cron needed for KV.

### Key Files

| File | Role |
|------|------|
| `worker/wrangler.toml` | Worker config: name `zhe-edge`, KV binding `LINKS_KV`, cron `*/30 * * * *` |
| `worker/src/index.ts` | Worker source: fetch handler (proxy + redirect) + scheduled handler (cron) |
| `worker/test/index.test.ts` | 38 unit tests covering all routing, redirect, analytics, cron paths |
| `worker/package.json` | Standalone deps: `wrangler`, `@cloudflare/workers-types`, `vitest` |

### Worker Secrets (set via `wrangler secret put`)

| Secret | Purpose |
|--------|---------|
| `ORIGIN_URL` | Railway backend URL (e.g. `https://zhe.to`) |
| `WORKER_SECRET` | Shared secret for `/api/cron/cleanup` and `/api/record-click` authentication |

### Reserved Paths (must stay in sync with `lib/constants.ts`)

The Worker's `RESERVED_PATHS` set mirrors `lib/constants.ts:RESERVED_PATHS`. If you add/remove a reserved path in the main app, you **must** also update `worker/src/index.ts` and redeploy.

### Deployment

```bash
cd worker
bun install
bun run deploy    # wrangler deploy
bun run test      # vitest run (38 tests)
bun run dev       # wrangler dev (local testing)
bun run tail      # wrangler tail (live logs)
```

Workers.dev URL: `https://zhe-edge.<your-subdomain>.workers.dev`
KV Namespace: `zhe` (ID in `worker/wrangler.toml`)

### Geo Header Mapping

The Worker maps Cloudflare geo headers to the Vercel-style headers the origin expects:

| Cloudflare Header | Mapped To | Used By |
|-------------------|-----------|---------|
| `CF-IPCountry` | `x-vercel-ip-country` | `extractClickMetadata()` in `lib/analytics.ts` |
| `request.cf.city` | `x-vercel-ip-city` | `extractClickMetadata()` in `lib/analytics.ts` |

## Retrospective

- **Atomic commits**: Never bundle multiple logical changes (infra, model, viewmodel, view) into a single commit. Always split by layer/concern, even if they're part of the same feature. Each commit must be independently buildable and testable.
- **E2E port isolation**: BDD E2E tests must use a dedicated port (27006) separate from the dev server (7006). Never reuse an existing dev server for E2E — Playwright always starts its own with `PLAYWRIGHT=1`. This avoids env-var mismatch bugs where the CredentialsProvider is missing.
- **Version bump find-replace safety**: When bumping versions in `package.json`, never use naive substring replacement (e.g. `sd '1.2.1' '1.2.2'`) because it can corrupt dependency versions (e.g. `^1.2.10` becomes `^1.2.20` when `1.2.1` is matched as a substring). Always use targeted edits scoped to the `"version"` field, or use word-boundary-aware regex.
- **HighlightText breaks `getByText`**: When a component splits text across multiple DOM elements (e.g. `<span>zhe.to/</span><mark>abc</mark>`), `screen.getByText("zhe.to/abc")` fails because no single element contains the full text. Use `data-value` attributes on parent elements (e.g. `[cmdk-item][data-value="slug"]`) to locate items, then assert on `element.textContent` which concatenates all child text nodes.
- **eslint-disable placement**: `// eslint-disable-next-line` only suppresses the immediately following line. If placed before a variable declaration but the lint violation is on a JSX return two lines below, it has no effect and creates an "unused eslint-disable" warning. Always place the directive directly above the offending line.
- **Next.js `allowedOrigins` checks the browser `Origin` header, not `x-forwarded-host`**: When a reverse proxy rewrites `x-forwarded-host` (e.g. Railway sets it to `origin.zhe.to`), the CSRF check compares `x-forwarded-host` against the browser's `Origin` header (`zhe.to`). On mismatch, it calls `isCsrfOriginAllowed(originDomain, allowedOrigins)` where `originDomain` is from the browser `Origin` — so `allowedOrigins` must contain the **browser domain** (`zhe.to`), not the forwarded host (`origin.zhe.to`). Always read the actual Next.js source (`action-handler.js`) to verify which value is checked.
- **E2E cross-spec data pollution**: Serial Playwright specs that assume empty state (e.g. "no uploads") will fail when another spec seeds data into the same table and global teardown only runs at the end. Always add a `beforeAll` cleanup (`DELETE FROM <table> WHERE user_id = ?`) at the start of serial specs that depend on empty state, even if global teardown handles cleanup eventually.
- **Playwright `getByText` substring matching in tables**: `getByText('GET')` inside a `<table>` can fail when the same text appears as both an exact cell value (`<td>GET</td>`) and a substring in another cell (`<td>Get status, stats & API schema</td>`). Use `{ exact: true }` to restrict matching to elements whose entire text content equals the search string. Similarly, use `.first()` when multiple `<pre>` blocks in a documentation section all contain common terms like "curl".
- **vitest 4 `vi.fn()` arrow-function constructor breaking change**: In vitest 4, `vi.fn().mockImplementation(() => ({...}))` no longer works when the mock is called with `new` — it returns `undefined` instead of the object. Must use `vi.fn().mockImplementation(function() { return {...}; })` (regular function) for any mock that will be `new`'d (e.g. `ScopedDB`, S3 clients).
- **vitest 4 `coverage.all` behavior change**: vitest 4 removed the `coverage.all` option and now automatically includes all files matching `coverage.include` globs, even if no test imports them. This means `app/**/route.ts` in `coverage.include` pulls in all API route files at 0% coverage, tanking the overall percentage. Solution: remove `app/**/route.ts` from `coverage.include` since API routes are tested by L3 E2E tests, not L1 unit tests.
- **`bun update --latest` can jump major versions unexpectedly**: Running `bun update --latest` on packages like `eslint` or `@types/node` can jump to incompatible major versions (e.g. eslint 9→10, @types/node 22→25). Always verify the installed version after `--latest` and pin to the correct major if needed.
- **Preset configs lock you to the slowest transitive plugin**: `eslint-config-next@16` pulls in `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, and `eslint-plugin-import` as transitive deps. When eslint 10 removed `context.getFilename()` / `context.getSourceCode()`, `eslint-plugin-react@7.37.5` crashed on load (`TypeError: contextOrFilename.getFilename is not a function`) and the preset stayed unusable until jsx-eslint shipped a fix (`PR #3979` was still open weeks later). For an infra cliff like this, **don't patch node_modules** — the patch becomes a maintenance burden and rots after the upstream fix lands differently. Hand-roll the flat config from per-plugin sources instead. (2026-06-22: did this in two passes. Pass 1 swapped to `@next/eslint-plugin-next` + `eslint-plugin-react-hooks` + `typescript-eslint` only — fast to ship but lost ~32 rules. Pass 2 restored coverage by adopting drop-in replacements that are already ESLint-10-native: `@eslint-react/eslint-plugin` for react/, `eslint-plugin-jsx-a11y@6.10.2` (stale peer but no deprecated context API in source — works fine), and `eslint-plugin-import-x` for import/. End state: equivalent-or-better rule coverage than the original preset, plus RSC rules the legacy plugin never had, and no transitive dependence on jsx-eslint's release cadence.)
- **`eslint-disable` directives are namespace-scoped, not rule-name-scoped**: When migrating from `eslint-plugin-react` to `@eslint-react/eslint-plugin` (or `eslint-plugin-import` → `import-x`), the new plugins ship rules under different namespaces (`@eslint-react/exhaustive-deps`, `import-x/no-duplicates`) but with semantically identical names. Existing `// eslint-disable-next-line react-hooks/exhaustive-deps` comments only silence the old rule — the new namespace fires independently. Grep for `eslint-disable.*<old-namespace>` after any plugin swap and append the new rule name to each comment, e.g. `// eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps`. (2026-06-22: caught three of these in viewmodels during the @eslint-react adoption; lint went from 0 errors to 3 warnings purely from the namespace shift.)
- **Dirty flag belongs at D1 mutation sites, not KV client**: A "needs sync" dirty flag must be set when D1 is mutated (the source of truth changes), not when the KV cache write succeeds. Setting it on KV success inverts the semantics — KV write failures leave dirty=false, which causes the compensating cron sync to skip, leaving KV permanently stale. Always place cache-invalidation signals at the mutation source, not the cache write path.
- **Always commit lockfile with dependency changes**: When adding/removing dependencies in `package.json`, always `bun install` and commit the updated `bun.lock` in the same commit. `--frozen-lockfile` in CI/CD (Railway Dockerfile) will reject builds if the lockfile doesn't match the manifest.
- **Playwright globalSetup/globalTeardown share the same Node process**: Unlike test workers, `globalSetup` and `globalTeardown` run sequentially in Playwright's main process. Any `process.env` mutation in globalSetup is visible in globalTeardown. This means teardown must **not** repeat the "prod vs test inequality check" (`testDbId === prodDbId`) because globalSetup already overwrote `CLOUDFLARE_D1_DATABASE_ID` to `testDbId` — making them always equal. Instead, teardown should confirm the override is still in effect (`currentDbId === testDbId`).
- **Mock INSERT must read params, never hardcode return values**: When a mock DB intercepts an INSERT statement, it must destructure **all** columns from the params array and use them in the returned row. Hardcoding fields to `null` (e.g. `screenshot_url: null, note: null`) masks bugs where the real SQL omits a column — the test passes because the mock always returns null regardless of input. When adding a new column to an INSERT: (1) update the SQL, (2) update the mock's param destructuring, (3) add a test that round-trips the new field through create → read. A broader check: whenever a schema migration adds a column, grep for all INSERT statements touching that table and verify each one includes the new column.
- **D1 migration must be applied to prod**: After adding a new migration file in `drizzle/migrations/`, it must be executed on `zhe-db` (production) before release. The local L2/L3 stack replays the full migration set on every run, so test never lags — prod is the only place a migration can be forgotten. Always verify prod has the same table structure before release. (2026-04-13: ideas API returned 500 because `0020_add_ideas.sql` was only applied to test, not prod. 2026-06-13: dev/test went away when L2/L3 moved to a local Miniflare stack — prod is now the sole gap.)
- **navigation.spec.ts is turbopack-warmup flaky**: With `workers: 4`, parallel first-compiles of `/dashboard/{webhook,inbox,backy,xray,...}` can each blow the default 30s test timeout (waitForURL hangs while turbopack compiles the route). Single-spec runs are 14/14 green. The whole file is wrapped in `test.describe.configure({ timeout: 60_000, retries: 1 })` to absorb the warm-up — do NOT add `test.slow()` to individual cases (mixed timeouts read as "this one is special"). If the retry rate climbs, look for a real navigation regression first; only then loosen the timeout further. (2026-06-13: v1.19.1 release preflight failed once on "navigate to Webhook" and once on "navigate to Inbox" — both flaky, both green when re-run alone.)
- **Never use `last_insert_rowid()` across multiple INSERTs in a D1 batch**: In D1's `batch()` API, `last_insert_rowid()` returns the row ID of the most recent INSERT across **all** statements in the batch — not just a specific table. When a batch contains `INSERT INTO ideas ... RETURNING *` followed by multiple `INSERT INTO idea_tags (idea_id, tag_id) VALUES (last_insert_rowid(), ?)`, the second idea_tags INSERT gets the row ID from the **first** idea_tags INSERT (not the ideas INSERT), causing a FOREIGN KEY constraint failure. Fix: insert the parent row first via a single query with `RETURNING *` to get its concrete ID, then batch-insert child rows with the explicit ID. This applies to any parent-child INSERT pattern in D1 batches.
- **Railway Watch Paths skip version-bump deploys**: The Railway service has Watch Paths configured (dashboard-only setting), so a `chore: bump version` commit that touches only `package.json` / `CHANGELOG.md` / `cli/` is judged SKIPPED and never deploys. After `bun run release` pushes, production `/api/live` version stays stale (long `uptime` = origin never restarted). The release script (`scripts/release.ts` Phase 6) now runs `railway redeploy --from-source --yes` after the push and polls `/api/live` for up to 5 minutes until the version matches — so the SKIP is recovered automatically. Skip with `--skip-redeploy` if you must bypass. (2026-06-06: v1.18.2 push SKIPPED twice; manual `redeploy --from-source` brought prod to 1.18.2. 2026-06-09: v1.18.3 SKIPPED again, automated Phase 6 added in the same session.)
- **L3 spec drift only surfaces in CI** — automate L3 as a release preflight: pre-commit covers L1+G1+G2, pre-push covers L2, but Playwright (L3) only fires on GitHub Actions. That means a P0/P1 change touching user-visible labels, redirects, or toast copy can pass every local gate, get tagged, and only then fail CI. Always grep `tests/playwright/` (in addition to `tests/components/` and `tests/api/`) when changing routes, breadcrumbs, page titles, or globally-visible toast text. The release script (`scripts/release.ts` Phase 0.5) now runs `bun run test:e2e:pw` as a hard gate **before** the version bump so spec drift aborts the release instead of becoming a follow-up patch commit. (2026-06-09: v1.18.3 CI failed on `auth-guard.spec.ts` waiting `**/dashboard` after the redirect moved to `/dashboard/overview`, and `data-management.spec.ts` `getByText('导入完成')` exploded on strict mode after a sonner toast was added next to the existing inline result block.)
- **Sonner toast text duplicates inline copy → Playwright strict mode breaks**: When introducing a toast on a page that already has an inline result/status message containing similar phrasing, `page.getByText('共同子串')` resolves to **two** elements (toast DOM + inline DOM both render concurrently for ~4s) and Playwright's strict mode fails. Either (a) make the toast and inline copy textually distinct, or (b) pin the assertion with `.first()` — either surfacing is enough proof the action landed. Audit existing specs whenever a viewmodel gains its first toast on a page that already shows an inline `importResult` / `lastSyncResult` / similar state block. (2026-06-09: `getByText('导入完成')` and `getByText(/跳过\s+\d+\s+条/)` in `data-management.spec.ts` both needed `.first()` after `useSettingsViewModel` started toasting on import.)
- **github.com:443 — default to direct, fall back to Clash proxy only on failure**: Direct HTTPS to `github.com:443` usually works in this environment. Run `git push` / `gh` / `wrangler` / `curl` without any proxy first. Only if the connection fails (timeout, TLS handshake error, `Could not resolve host`) should you retry with the Clash proxy at `127.0.0.1:7890` — and only if it is actually running (`nc -z 127.0.0.1 7890 2>/dev/null`). Examples for the fallback: `git -c http.proxy=http://127.0.0.1:7890 push ...`, `HTTPS_PROXY=http://127.0.0.1:7890 gh release create ...`. The `gh-personal` SSH host (ssh.github.com:443) is another fallback if HTTPS keeps failing. Never set the proxy unconditionally — it slows down healthy paths and pollutes telemetry. (2026-06-09 retro originally said "always use the proxy" because of a transient outage; corrected 2026-06-10 after multiple sessions confirmed direct works.)

## Testing

### Test Environment Isolation

L2/L3 E2E tests run against a **fully local stack** — no remote Cloudflare resources, no `CLOUDFLARE_API_TOKEN`, no `D1_TEST_*` / `R2_TEST_*` / `KV_TEST_*` env vars. `wrangler whoami` reporting "not logged in" does not affect test runs.

Stack components (managed by `scripts/test-stack.ts`):
- **D1** — `wrangler dev --local --config worker/wrangler.local.toml --persist-to .test-storage/wrangler` runs the Worker code on `127.0.0.1:8788` against a Miniflare-managed SQLite at `.test-storage/wrangler/`. All `drizzle/migrations/*.sql` are applied to the empty DB on every L2/L3 run, so prod/test schema drift is impossible.
- **KV** — `LINKS_KV` binding lives inside the same Miniflare instance. `lib/kv/client.ts` is a no-op when `CLOUDFLARE_KV_NAMESPACE_ID` is unset (which is what the local stack does); KV correctness is covered by `worker/test/index.test.ts` and the L3 redirect specs.
- **R2** — `lib/r2/client.ts` branches on `LOCAL_R2=1` and writes to `.test-storage/r2/` via `lib/r2/local-fs-backend.ts`. `scripts/local-r2-server.ts` runs an HTTP shim on `127.0.0.1:18788` for browser-side presigned PUT and public GET (signature is not validated; CORS is wide open). Production paths are unchanged.
- **`_test_marker`** — `seedTestMarker()` inserts `('env', 'test')` into a dedicated table; helpers refuse to operate if the marker is missing or the proxy URL is not 127.0.0.1/localhost.

Hand-applied prod-only schema fixups live in `scripts/test-stack.ts:applySchemaFixups()` (currently only `analytics.source`). When prod adds a column outside drizzle, mirror it here AND open a real migration so `bun run release` migration parity stops yelling.

Layout under `.test-storage/` (gitignored):

```
.test-storage/
├── wrangler/   # Miniflare D1 SQLite + KV store
└── r2/         # filesystem R2 backend
```

### Quality System: L1 + L2 + L3 + G1 + G2

| Layer | Name | Hook | Gate |
|-------|------|------|------|
| L1 | Unit/Component + Integration | pre-commit | Hard |
| L2 | API E2E (real HTTP) | pre-push | Hard |
| L3 | System/E2E (Playwright) | on-demand | Hard |
| G1 | Static Analysis (tsc + ESLint strict) | pre-commit | Hard |
| G2 | Security (gitleaks + osv-scanner) | pre-commit + pre-push | Hard |

### Commands

| Command | Layer | Description |
|---------|-------|-------------|
| `bun run test` | — | Watch mode |
| `bun run test:run` | — | Single run (all tests) |
| `bun run test:unit` | L1 | Unit tests only (excludes `tests/api/` and `tests/integration/`) |
| `bun run test:unit:coverage` | L1 | Unit tests with coverage threshold enforcement |
| `bun run test:integration` | L1 | Server Actions + route handler integration tests (in-process) |
| `bun run test:api` | L2 | API E2E tests (starts dev server on port 17006, real HTTP) |
| `bun run test:coverage` | — | Coverage report |
| `bun run typecheck` | G1 | TypeScript type check (`tsc --noEmit`) |
| `bun run lint` | G1 | ESLint strict (zero warnings) |
| `bun run release` | — | Automated release: bump, changelog, commit, push, tag, GH release |

### E2E (Playwright)

Playwright tests run a **dedicated** Next.js dev server on **port 27006** with `PLAYWRIGHT=1` and `AUTH_URL=http://localhost:27006`. This is completely isolated from the regular dev server (port 7006) and API E2E server (port 17006).

| Command | Description |
|---------|-------------|
| `bun run test:e2e:pw` | Run all Playwright specs headless |
| `bun run test:e2e:pw:ui` | Open Playwright UI mode for debugging |

**How it works:**
- `playwright.config.ts` defines `webServer` that auto-starts a fresh Next.js instance on port 27006
- `reuseExistingServer: false` — always starts its own server, never reuses an existing one
- `PLAYWRIGHT=1` activates the `e2e-credentials` CredentialsProvider in `auth.ts`
- `AUTH_URL` is set to `http://localhost:27006` so NextAuth uses non-secure cookies
- Global setup inserts the test user into D1; global teardown cleans up

**Git hooks:**
- **pre-commit**: L1 (unit + integration + coverage gate) + G1 (typecheck + lint-staged) + G2 (gitleaks)
- **pre-push**: L2 (API E2E real HTTP) + G2 (osv-scanner) — all hard gates
- **on-demand**: L3 (BDD E2E via `bun run test:e2e:pw`)

### Port Allocation

| Port | Purpose |
|------|---------|
| 7006 | Development server (`bun run dev`) |
| 17006 | L2 API E2E test server (`run-api-e2e.ts`, auto-managed) |
| 27006 | L3 Playwright BDD E2E test server (auto-managed) |
