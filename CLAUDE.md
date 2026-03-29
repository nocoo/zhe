README.md

## Versioning

### Single Source of Truth

The **only** authoritative version number lives in `package.json` `"version"` field (format: `1.2.3`).

- **Storage format**: bare semver `1.2.3` (in `package.json`)
- **Display format**: `v1.2.3` (git tags, GitHub releases, CHANGELOG headers, UI/docs)
- All runtime references import `APP_VERSION` from `lib/version.ts`, which reads `package.json` at build time
- **No hardcoded version strings anywhere** — `package.json` is the only place to update

### Version References

| File | Role |
|------|------|
| `package.json` | `"version"` field — **the only place to update** |
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
```

The script performs these steps automatically:
1. Preflight: verify clean working tree, branch, `gh` auth
2. Bump `package.json` `"version"` field (targeted regex, not naive substring replace)
3. Run `bun install` to sync `bun.lock` (prevents `--frozen-lockfile` failures in CI)
4. Generate CHANGELOG.md section from `git log` (conventional commit classification)
5. Verify no stale old version strings remain in `*.ts`/`*.tsx` via `rg`
6. Commit: `chore: bump version to x.y.z` (triggers pre-commit hooks: L1 + G1 + G2)
7. Interactive confirmation gate
8. Push → Tag (`v`-prefixed, annotated) → Push tags → GitHub Release

Pre-commit hooks (L1 tests, G1 lint/typecheck, G2 gitleaks) run automatically during step 6. Pre-push hooks (L2 API E2E, G2 osv-scanner) run during step 8.

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
- **E2E port isolation**: BDD E2E tests must use a dedicated port (27005) separate from the dev server (7005). Never reuse an existing dev server for E2E — Playwright always starts its own with `PLAYWRIGHT=1`. This avoids env-var mismatch bugs where the CredentialsProvider is missing.
- **Version bump find-replace safety**: When bumping versions in `package.json`, never use naive substring replacement (e.g. `sd '1.2.1' '1.2.2'`) because it can corrupt dependency versions (e.g. `^1.2.10` becomes `^1.2.20` when `1.2.1` is matched as a substring). Always use targeted edits scoped to the `"version"` field, or use word-boundary-aware regex.
- **HighlightText breaks `getByText`**: When a component splits text across multiple DOM elements (e.g. `<span>zhe.to/</span><mark>abc</mark>`), `screen.getByText("zhe.to/abc")` fails because no single element contains the full text. Use `data-value` attributes on parent elements (e.g. `[cmdk-item][data-value="slug"]`) to locate items, then assert on `element.textContent` which concatenates all child text nodes.
- **eslint-disable placement**: `// eslint-disable-next-line` only suppresses the immediately following line. If placed before a variable declaration but the lint violation is on a JSX return two lines below, it has no effect and creates an "unused eslint-disable" warning. Always place the directive directly above the offending line.
- **Next.js `allowedOrigins` checks the browser `Origin` header, not `x-forwarded-host`**: When a reverse proxy rewrites `x-forwarded-host` (e.g. Railway sets it to `origin.zhe.to`), the CSRF check compares `x-forwarded-host` against the browser's `Origin` header (`zhe.to`). On mismatch, it calls `isCsrfOriginAllowed(originDomain, allowedOrigins)` where `originDomain` is from the browser `Origin` — so `allowedOrigins` must contain the **browser domain** (`zhe.to`), not the forwarded host (`origin.zhe.to`). Always read the actual Next.js source (`action-handler.js`) to verify which value is checked.
- **E2E cross-spec data pollution**: Serial Playwright specs that assume empty state (e.g. "no uploads") will fail when another spec seeds data into the same table and global teardown only runs at the end. Always add a `beforeAll` cleanup (`DELETE FROM <table> WHERE user_id = ?`) at the start of serial specs that depend on empty state, even if global teardown handles cleanup eventually.
- **Playwright `getByText` substring matching in tables**: `getByText('GET')` inside a `<table>` can fail when the same text appears as both an exact cell value (`<td>GET</td>`) and a substring in another cell (`<td>Get status, stats & API schema</td>`). Use `{ exact: true }` to restrict matching to elements whose entire text content equals the search string. Similarly, use `.first()` when multiple `<pre>` blocks in a documentation section all contain common terms like "curl".
- **vitest 4 `vi.fn()` arrow-function constructor breaking change**: In vitest 4, `vi.fn().mockImplementation(() => ({...}))` no longer works when the mock is called with `new` — it returns `undefined` instead of the object. Must use `vi.fn().mockImplementation(function() { return {...}; })` (regular function) for any mock that will be `new`'d (e.g. `ScopedDB`, S3 clients).
- **vitest 4 `coverage.all` behavior change**: vitest 4 removed the `coverage.all` option and now automatically includes all files matching `coverage.include` globs, even if no test imports them. This means `app/**/route.ts` in `coverage.include` pulls in all API route files at 0% coverage, tanking the overall percentage. Solution: remove `app/**/route.ts` from `coverage.include` since API routes are tested by L3 E2E tests, not L1 unit tests.
- **`bun update --latest` can jump major versions unexpectedly**: Running `bun update --latest` on packages like `eslint` or `@types/node` can jump to incompatible major versions (e.g. eslint 9→10, @types/node 22→25). Always verify the installed version after `--latest` and pin to the correct major if needed. `eslint` 10.x is incompatible with `@rushstack/eslint-patch` used by `eslint-config-next`.
- **Dirty flag belongs at D1 mutation sites, not KV client**: A "needs sync" dirty flag must be set when D1 is mutated (the source of truth changes), not when the KV cache write succeeds. Setting it on KV success inverts the semantics — KV write failures leave dirty=false, which causes the compensating cron sync to skip, leaving KV permanently stale. Always place cache-invalidation signals at the mutation source, not the cache write path.
- **Always commit lockfile with dependency changes**: When adding/removing dependencies in `package.json`, always `bun install` and commit the updated `bun.lock` in the same commit. `--frozen-lockfile` in CI/CD (Railway Dockerfile) will reject builds if the lockfile doesn't match the manifest.
- **Playwright globalSetup/globalTeardown share the same Node process**: Unlike test workers, `globalSetup` and `globalTeardown` run sequentially in Playwright's main process. Any `process.env` mutation in globalSetup is visible in globalTeardown. This means teardown must **not** repeat the "prod vs test inequality check" (`testDbId === prodDbId`) because globalSetup already overwrote `CLOUDFLARE_D1_DATABASE_ID` to `testDbId` — making them always equal. Instead, teardown should confirm the override is still in effect (`currentDbId === testDbId`).
- **Mock INSERT must read params, never hardcode return values**: When a mock DB intercepts an INSERT statement, it must destructure **all** columns from the params array and use them in the returned row. Hardcoding fields to `null` (e.g. `screenshot_url: null, note: null`) masks bugs where the real SQL omits a column — the test passes because the mock always returns null regardless of input. When adding a new column to an INSERT: (1) update the SQL, (2) update the mock's param destructuring, (3) add a test that round-trips the new field through create → read. A broader check: whenever a schema migration adds a column, grep for all INSERT statements touching that table and verify each one includes the new column.

## Testing

### Test Environment Isolation

L2/L3 E2E tests use **dedicated Cloudflare resources** (`zhe-db-test` / `zhe-test` / `zhe-test`), never production. Four safety layers prevent accidental production writes:

1. Env override in test entry (`main()` / `globalSetup`)
2. `testDbId !== prodDbId` inequality check
3. Defensive guard in `executeD1()` / `queryD1()`
4. `_test_marker` table verification (exists only in test DB)

Key env vars for test isolation (set in `.env.local`):
- `D1_TEST_DATABASE_ID` — must **not** equal `CLOUDFLARE_D1_DATABASE_ID`
- `R2_TEST_BUCKET_NAME` / `R2_TEST_PUBLIC_DOMAIN` — test R2 bucket
- `KV_TEST_NAMESPACE_ID` — test KV namespace

See [docs/14-cloudflare-resource-inventory.md](docs/14-cloudflare-resource-inventory.md) for full design.

### Quality System: L1 + L2 + L3 + G1 + G2

| Layer | Name | Hook | Gate |
|-------|------|------|------|
| L1 | Unit/Component + Integration | pre-commit | Hard |
| L2 | API E2E (real HTTP) | pre-push | Soft (skips if D1 unreachable) |
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
| `bun run test:api` | L2 | API E2E tests (starts dev server on port 17005, real HTTP) |
| `bun run test:coverage` | — | Coverage report |
| `bun run typecheck` | G1 | TypeScript type check (`tsc --noEmit`) |
| `bun run lint` | G1 | ESLint strict (zero warnings) |
| `bun run release` | — | Automated release: bump, changelog, commit, push, tag, GH release |

### E2E (Playwright)

Playwright tests run a **dedicated** Next.js dev server on **port 27005** with `PLAYWRIGHT=1` and `AUTH_URL=http://localhost:27005`. This is completely isolated from the regular dev server (port 7005) and API E2E server (port 17005).

| Command | Description |
|---------|-------------|
| `bun run test:e2e:pw` | Run all Playwright specs headless |
| `bun run test:e2e:pw:ui` | Open Playwright UI mode for debugging |

**How it works:**
- `playwright.config.ts` defines `webServer` that auto-starts a fresh Next.js instance on port 27005
- `reuseExistingServer: false` — always starts its own server, never reuses an existing one
- `PLAYWRIGHT=1` activates the `e2e-credentials` CredentialsProvider in `auth.ts`
- `AUTH_URL` is set to `http://localhost:27005` so NextAuth uses non-secure cookies
- Global setup inserts the test user into D1; global teardown cleans up

**Git hooks:**
- **pre-commit**: L1 (unit + integration + coverage gate) + G1 (typecheck + lint-staged) + G2 (gitleaks advisory)
- **pre-push**: L2 (API E2E real HTTP, soft gate) + G2 (osv-scanner advisory)
- **on-demand**: L3 (BDD E2E via `bun run test:e2e:pw`)

### Port Allocation

| Port | Purpose |
|------|---------|
| 7005 | Development server (`bun run dev`) |
| 17005 | L2 API E2E test server (`run-api-e2e.ts`, auto-managed) |
| 27005 | L3 Playwright BDD E2E test server (auto-managed) |
