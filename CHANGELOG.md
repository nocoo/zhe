# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [v1.12.0] - 2026-04-12

### Added
- Make PATCH /api/v1/links/:id transactional with D1 batch
- Add filters, inbox, folders, tags commands and enhanced update
- Add query/inbox/tag filters to GET /api/v1/links

### Changed
- Add regression tests for PATCH tag validation
- Skip flaky config test that reads real user config
- Sync version to 1.11.3

### Fixed
- Store expiresAt as milliseconds in PATCH batch
- Validate removeTags in PATCH /api/v1/links/:id
- Add mutual exclusion check for --inbox and --folder
- Read version from package.json instead of hardcoding
- Ensure atomic validation in PATCH /api/v1/links/:id
- Validate tag operations and screenshotUrl in PATCH endpoint
- Exclude cli/ from Next.js tsconfig

## [v1.11.3] - 2026-04-12

### Changed
- Document CLI version sync requirement in CLAUDE.md
- Bump version to 1.11.0 for npm release
- Refine CLI design login semantics and command naming
- Revise CLI design to align with API v1 and security model
- Add CLI design document (18-cli-design.md)

### Fixed
- Resolve exactOptionalPropertyTypes TypeScript errors
- 指定 l2-command 为 test:api，修复 L2 E2E 找不到脚本
- Fix localStorage mock for Node.js 25+

## [v1.11.2] - 2026-04-12

### Changed
- Document CLI version sync requirement in CLAUDE.md
- Bump version to 1.11.0 for npm release
- Refine CLI design login semantics and command naming
- Revise CLI design to align with API v1 and security model
- Add CLI design document (18-cli-design.md)

### Fixed
- Resolve exactOptionalPropertyTypes TypeScript errors
- 指定 l2-command 为 test:api，修复 L2 E2E 找不到脚本
- Fix localStorage mock for Node.js 25+

## [v1.11.1] - 2026-04-12

### Changed
- Document CLI version sync requirement in CLAUDE.md
- Bump version to 1.11.0 for npm release
- Refine CLI design login semantics and command naming
- Revise CLI design to align with API v1 and security model
- Add CLI design document (18-cli-design.md)

### Fixed
- Resolve exactOptionalPropertyTypes TypeScript errors
- 指定 l2-command 为 test:api，修复 L2 E2E 找不到脚本
- Fix localStorage mock for Node.js 25+

## [v1.11.0] - 2026-04-12

### Added
- Add webhook-to-apikey migration
- Add /api/v1/tags endpoints
- Add /api/v1/uploads endpoints
- Add /api/v1/folders endpoints
- Add /api/v1/links/[id] endpoint
- Add /api/v1/links endpoint
- Add API audit logging
- Add per-key rate limiting
- Add api-key auth middleware
- Add API keys management UI
- Add api-keys server actions
- Add api_keys CRUD to ScopedDB
- Add api_keys table migration
- Add api-key model with hash/verify

### Changed
- Fix API rate limit default to 100 req/min
- Fix API documentation to match implementation
- Mark Phase 5 as completed
- Update API documentation for v1 endpoints
- Update Phase 4 and 5 progress
- Mark webhook token endpoint as deprecated
- Update Phase 3 progress (all completed)
- Update Phase 3 progress (3.1, 3.2 completed)
- Separate api-keys db module for Edge Runtime compatibility
- Mark Phase 2 as completed
- Mark Phase 1 as completed
- Fix security vulnerabilities
- Add D1 Worker proxy migration documentation
- Exclude page/layout components from coverage calculation
- Migrate to nocoo/base-ci@v2026

### Fixed
- Clear env vars in beforeEach to avoid .env.local pollution
- Add index on api_keys.key_hash for auth performance
- Clarify webhook migration is two-step process
- Connect rate limiting to all v1 routes
- Replace non-null assertions with optional chaining

### Removed
- Remove unsupported enable-l3 input

## [v1.10.0] - 2026-04-04

### Added
- Add Worker D1 proxy client path
- Add /api/d1-query endpoint for D1 proxy
- Add test Worker config (wrangler.test.toml)

### Changed
- Add Folder CRUD E2E test
- Mark D1 proxy commits 1-8 complete, add deployment instructions
- Add D1 proxy endpoint L2 E2E test
- Add HARD GATE for D1 proxy in L2/L3 test harnesses
- Add proxy path unit tests
- Add D1 proxy handler tests
- Normalize UNIQUE errors, always return HTTP 200
- Narrow error preservation to UNIQUE only
- Hard gate tests, fix Playwright wiring, scope error sanitization
- Fix test wiring, error contract, and path
- Address security and isolation concerns
- Add Worker D1 Proxy design document

### Fixed
- Use word boundaries to avoid version false positives
- Fix hydration mismatch for viewMode
- Reduce proxy timeout to 3s (not 10s)
- Use timing-safe comparison for D1 proxy auth

### Removed
- Remove HTTP API fallback, use Worker proxy only

## [v1.9.4] - 2026-04-03

### Added
- Add missing Badge variants per B-4 spec
- Add Skeleton loading component

### Changed
- Add dev server to superset run config
- Extract Barcode to standalone component
- Extract GoogleIcon to standalone component
- Migrate ports 7005/17005/27005 → 7006/17006/27006

### Fixed
- Correct dark mode --input token per B-5 spec
- Add Tooltip for logout button in expanded view
- Correct osv-scanner config path to match actual filename

## [v1.9.3] - 2026-03-30

### Added
- Add fade-up entry animation with staggered delays

### Changed
- Standardize logo assets per basalt B-3 spec
- Upgrade dashboard to gen 2 context architecture (B-2 spec)
- Add mock INSERT fidelity rule to retrospective

### Fixed
- Update L3 Playwright selectors for current page structure
- Resolve button-in-button hydration error in CollapsibleNavGroup
- Add tabular-nums and font-display to stat card numbers
- Add aria-sort to storage-page sort controls
- Badge transparent border, font-medium, semantic tinted variants
- Remove card border/shadow anti-pattern, use bg-secondary base

## [v1.8.6] - 2026-03-29

### Changed
- Add .claude/ to gitignore
- Add createLink screenshotUrl and note coverage
- Restore R2 preview image URL in README

### Fixed
- Read note and screenshot_url from INSERT params in mock
- Add screenshot_url to public createLink INSERT SQL
- Add screenshot_url to ScopedDB.createLink INSERT SQL
- Update osv-scanner config path for v2
- Update transitive deps and migrate osv-scanner config to v2 format
- Use local image instead of R2 URL for README preview
- Replace real Cloudflare D1/KV UUIDs in audit doc with placeholders

## [v1.8.5] - 2026-03-27

### Added
- Add CI workflow using reusable bun quality gate
- Add unwrap() test utility for null-safe assertions

### Changed
- Record completed security fixes in remediation plan
- Re-enable no-non-null-assertion eslint rule
- Replace non-null assertions with unwrap() in all test files

### Fixed
- Stabilize flaky uploads and webhook Playwright tests
- Move GitHub preview image to public/ directory
- Replace real Cloudflare D1/KV IDs with placeholders in docs
- Require R2_PUBLIC_DOMAIN env var in tmp upload endpoint
- Reject non-http/https URLs in link creation and webhook API
- Use timing-safe compare and remove query-secret fallback in cron routes
- Make WORKER_SECRET mandatory and use timing-safe compare in record-click
- Update storage summary card label '状态' → '临时文件'
- Increase timeouts for CI environment
- Reference nocoo/ci for reusable workflow
- Use string values for boolean workflow inputs
- Remove non-null assertions from source code

## [v1.8.4] - 2026-03-24

### Added
- Add automated release script

### Changed
- Make release script portable across projects

### Fixed
- Remove non-null assertions in release script
- Only classify as Removed when commit type is ambiguous
- Remove hardcoded version in release script comment and exclude self from stale check
- Sync bun.lock with package.json

## [v1.8.3] - 2026-03-24

### Changed
- Enable `noUncheckedIndexedAccess` in tsconfig for stricter type safety
- Enable `exactOptionalPropertyTypes` in tsconfig
- Enable `noUnusedLocals` and `noUnusedParameters` in tsconfig
- Enable `noFallthroughCasesInSwitch` in tsconfig
- Upgrade G2 security gate from soft (advisory) to hard (blocking)

## [v1.8.2] - 2026-03-23

### Added
- Add `.gitleaks.toml` with allowlists for build artifacts, test mock keys, and doc placeholders
- Add `.osv-scanner.toml` ignoring GHSA-5f7q-jpqc-wp7h (Next.js PPR DoS, PPR not enabled)
- Add `apiPostWorker` HTTP helper for WORKER_SECRET Bearer auth in L2 tests
- Add `apiGetAuth` / `apiPostAuth` session auth helpers with CSRF cookie forwarding
- Add L2 test for `/api/auth/[...nextauth]` (CSRF, providers, session)
- Add D1 seed helpers for webhooks, folders, backy pull/push config

### Changed
- Upgrade L2 from 4/11 to 11/11 API endpoint coverage (55 tests, 9 files, real HTTP)
- Eliminate Phase 1/Phase 2 split — all L2 tests now run as real HTTP against dev server
- Upgrade G2 hooks from advisory to hard gate (block commit/push when tool is present)
- Serialize L2 test files (`fileParallelism: false`) to prevent cross-file seed race conditions
- Update pre-push hook to osv-scanner v2 syntax (`scan --config=`)
- Lowercase `testSlug()` output to match API `sanitizeSlug()` behavior

### Fixed
- Fix CSRF cookie not forwarded in session auth helper (MissingCSRF error)
- Fix WORKER_SECRET Bearer auth missing from record-click L2 tests (403)
- Fix webhook stats test FK constraint (create user before webhook)
- Fix auth session test to accept both `null` and `{}` from NextAuth

## [v1.8.1] - 2026-03-22

### Added
- Add dedicated Cloudflare test resources (D1 `zhe-db-test`, R2 `zhe-test`, KV `zhe-test`) for E2E isolation
- Add four-layer safety system for test environment isolation (env override → inequality check → defensive guard → `_test_marker` table)
- Add `.env.example` with all production and test environment variables
- Add `_test_marker` table as last-line-of-defense for D1 test database verification
- Add `ensure-tools.sh` for graceful tool availability check (gitleaks, osv-scanner)

### Changed
- Upgrade ESLint to strict TypeScript rules
- Upgrade quality system to L1+L2+L3+G1+G2 (typecheck, strict lint, gitleaks, osv-scanner)
- Split API E2E into two-phase architecture (Phase 1 in-process always runs, Phase 2 real HTTP soft gate)
- Move route handler tests from L1 to L2 for proper HTTP-level testing
- Move server action tests to `tests/integration/` directory

### Fixed
- Fix test environment isolation: L2/L3 E2E tests now use dedicated test resources instead of production
- Fix inline comment parsing in all 4 custom `.env` parsers (comments were treated as values)
- Fix Playwright globalTeardown safety check for same-process env override
- Fix D1 safety guard to prevent API E2E against production database
- Fix stale `.next/types` detection by comparing route file structure
- Fix `AdapterAccount` and `ExportedLink` type mismatches in tests

## [v1.8.0] - 2026-03-17

### Added
- Add KV native expiration on write — expired keys auto-deleted by Cloudflare KV
- Add Worker edge lookup via lightweight `/api/lookup` API on KV miss (replaces full origin forward)
- Add negative cache (Cache API tombstone, 60s TTL) for confirmed slug misses at the edge
- Add KV backfill with native expiration on lookup API hit
- Add `expiresAt` field to `/api/lookup` response for KV backfill completeness
- Add dirty flag delta sync for D1 → KV (skip sync when no mutations since last run)
- Add KV sync to Worker cron schedule (parallel with cleanup, every 30 min)
- Batch KV writes in link import (N HTTP calls → 1)
- Add sparkline charts to overview stat cards
- Add slide animation to mobile sidebar via Sheet component
- Apply DM Sans font-display to stat cards and page headings
- Collapse filter bar to popover on mobile

### Changed
- Replace hardcoded colors with semantic design tokens (Basalt design system)
- Consolidate radius values to 3 Basalt tokens
- Migrate native select to shadcn Select component
- Extract shared FeatureCard component from card pattern
- Use `--highlight` token for search match highlighting

### Fixed
- Move `markKVDirty()` to D1 mutation sites (not KV client success path) — prevents KV permanently stale on write failure
- Place negative cache check after KV lookup — freshly-created slugs no longer masked by stale tombstone
- Forward expired KV hits and lookup misses to origin for real 404 page (not plain text)
- Include native expiration in Worker KV backfill path
- Restore label-control association for Radix Select triggers
- Align alert-dialog animation duration with dialog (200→150ms)
- Use unique id for sparkline gradient to avoid DOM id collision
- Speed up animations and replace hardcoded dark mode backgrounds
- Remove extraneous double spaces in sheet.tsx class strings

## [v1.7.2] - 2026-03-15

### Added
- Adopt Next.js file-based metadata convention with OG image and favicon.ico

### Changed
- Upgrade React and React DOM to 19.2.4
- Upgrade Next.js and eslint-config-next to 15.5.12
- Upgrade vitest 3→4, @vitest/coverage-v8 4, @vitejs/plugin-react 5
- Upgrade @aws-sdk/client-s3 and s3-request-presigner to 3.1003.0
- Upgrade lucide-react to 0.577.0, tailwind-merge to 3.5.0, url-metadata to 5.4.3
- Upgrade devDependencies (eslintrc, types, autoprefixer, drizzle-kit, eslint, lint-staged, postcss)
- Extract duplicate `rowToXxx` mappers to shared `lib/db/mappers.ts` module
- Rewrite and fix all project documentation (architecture, features, database, testing, deployment, contributing)

### Fixed
- Fix stale comment in `kv/sync.ts`
- Flush fire-and-forget microtasks in xray E2E test beforeEach (vitest 4 compat)

### Removed
- Remove dead `getLinksByUserId`, `deleteLinkById`, `updateLink` from `lib/db/index.ts`
- Remove dead `getAnalyticsByLinkId`, `getAnalyticsStats` from `lib/db/index.ts`
- Remove dead `getTweetCacheByIds` from `lib/db/index.ts`
- Remove dead `buildRecordClickUrl` from `lib/analytics.ts`
- Remove dead `kvGetLink` from `lib/kv/client.ts`
- Remove unused type exports from schema and constants
- Remove sensitive resource IDs from tracked files

## [v1.7.1] - 2026-03-05

### Added
- Add note, screenshot URL, and tags fields to create link dialog — parity with the inline edit mode on link cards

## [v1.7.0] - 2026-03-05

### Added
- Temporary file upload endpoint `POST /api/tmp/upload/[token]` — upload files to R2 `tmp/` prefix via webhook token auth, 10 MB max, returns download URL
- Cleanup cron route `POST /api/cron/cleanup` — delete tmp files older than 30 min (based on filename timestamp), triggered every 30 minutes by Worker cron
- Worker `scheduled` handler — cron trigger calls origin `/api/cron/cleanup` with Bearer auth for periodic tmp file cleanup
- Tmp upload URL display with copy button on webhook dashboard page
- Tmp upload curl example in webhook usage docs
- AI agent prompt includes tmp upload endpoint documentation when token is configured
- Tmp storage card on storage management page showing file count and total size
- `tmp-storage` model with `extractTimestampFromKey()`, `findExpiredTmpKeys()`, `computeTmpStats()` pure functions

### Changed
- Rename `/api/webhook/[token]` to `/api/link/create/[token]` for clarity
- Replace "状态" summary card with "临时文件" card on storage page

### Removed
- Remove unused `executeD1Batch` from d1-client

## [v1.6.3] - 2026-03-03

### Fixed
- Fix click analytics silently failing since v1.6.1: D1 REST API `/query` endpoint does not support parameterized multi-statement batches, so `recordClick` INSERT+UPDATE must be two separate queries
- Fix click source tagging (`worker` vs `origin`) never being persisted — all clicks showed as origin in Dashboard trend chart

## [v1.6.2] - 2026-03-03

### Added
- Unit tests for health, lookup, and record-click route handlers (L1 gap fill)
- BDD E2E specs for data management, storage, backy, and xray pages (L4 gap fill)
- API E2E tests for live, worker-status, and sync-kv endpoints (L3 gap fill)
- Coverage threshold enforcement in pre-commit hook

### Changed
- Rename `tests/e2e` to `tests/api` for accurate naming
- Migrate Playwright E2E port from 17005 to 27005
- Align pre-push hook with four-layer test architecture (L3 only; L4 now on-demand)
- Align all docs to reflect four-layer test architecture

### Fixed
- Preserve UNIQUE constraint error in D1 HTTP error path for duplicate detection
- Resolve strict mode and locator issues in E2E specs (webhook, uploads)
- Clean up leftover uploads in E2E to prevent cross-spec data pollution

## [v1.6.1] - 2026-03-02

### Added
- Webhook `note` parameter: optional bookmark note (max 500 chars) passed through to `createLink`
- OpenAPI 3.1 specification replaces custom documentation format in GET `/api/link/create/[token]` response
- AI Agent Prompt block on webhook settings page with copyable prompt for AI agents to discover and use the webhook API via GET schema discovery
- Backy pull webhook for remote backup trigger via `POST /api/backy/pull`
- Delta sync for KV cron: skip D1 query and KV write when nothing changed since last sync
- Stale-while-revalidate caching for overview page
- Cron history pagination (4 entries per page)
- Playwright E2E tests: webhook management UI (10), upload UI (10), overview page (8), tag UI (9), data import/export (24), Cmd+K search (9), folder CRUD (29), webhook API (17), 404 page and link expiration (9), Backy backup (30), Xray Twitter (37) — 192 new E2E scenarios total

### Changed
- Simplify pull webhook to key-only authentication (remove secret from DB schema, viewmodel, and UI)
- Simplify dashboard KV cache section and remove cron history UI
- Remove cron sync dirty flag, simplify KV architecture
- Add `data-testid` attributes to webhook, upload, overview, and tag UI components for E2E testing

### Fixed
- Use `X-Real-Host` header to prevent Railway overwriting public hostname in reverse proxy
- Click trend chart fills full card height via flex layout
- Count legacy `NULL`-source analytics rows as origin in click trend
- Use fixed pixel height for click trend chart to prevent Recharts -1 sizing
- Kill leftover process on Playwright E2E port before Playwright E2E in pre-push hook
- Fix `createLink` INSERT SQL missing `note` column in both unscoped and scoped DB functions

## [v1.6.0] - 2026-03-01

### Added
- Click source tagging: analytics records now include `source` field (`'origin'` for middleware, `'worker'` for Cloudflare Worker edge KV)
- 3-line click trend chart on Overview dashboard showing total clicks, worker (edge) clicks, and origin (middleware) clicks with gradient fills

### Changed
- `ClickTrendPoint` model extended with `origin` and `worker` breakdown fields
- Click trend chart fills full card height with responsive `min-h-[200px]`
- Worker sends `source: 'worker'` in `/api/record-click` payload; middleware passes `source: 'origin'` to `recordClick()`

## [v1.5.1] - 2026-03-01

### Fixed
- Worker health section showing empty data in production due to `instrumentation.ts` not being included in Next.js standalone output (turbopack omits instrumentation chunks)

### Changed
- Replace `instrumentation.ts` startup hook with on-demand KV sync in `getWorkerHealth` server action — when cron history is empty (first dashboard visit after deploy), triggers `performKVSync()` inline and returns fresh data
- Remove `instrumentation.ts` and its test file entirely; revert Dockerfile to clean state

## [v1.5.0] - 2026-03-01

### Added
- Cloudflare KV HTTP client for edge redirect caching (`lib/kv/client.ts`)
- KV sync wired into link create, update, delete, import, and webhook paths (fire-and-forget)
- Cron endpoint (`/api/cron/sync-kv`) for full D1-to-KV sync every 15 minutes
- Manual D1-to-KV sync CLI script (`scripts/sync-kv.ts`)
- Cloudflare Worker (`zhe-edge`) as transparent proxy with KV edge redirects, geo header mapping, and cron trigger
- Worker health section on Overview dashboard: last sync time, KV key count, sync success rate, and cron history table
- `/api/worker-status` auth-protected route returning derived worker health
- In-memory circular buffer (`lib/cron-history.ts`) for cron invocation history (max 50 entries)
- `WorkerHealthStatus` model with `deriveWorkerHealth()` and `formatRelativeTime()` pure functions

### Changed
- Unify `CRON_SECRET` and `INTERNAL_API_SECRET` into single `WORKER_SECRET` for all Worker-to-origin authentication
- `/api/record-click` now uses `Authorization: Bearer` header pattern (was `x-internal-secret`)
- DNS architecture: `zhe.to` → Cloudflare Worker Route, `origin.zhe.to` → Railway origin

### Fixed
- 5s timeout on D1 HTTP fetch to prevent Cloudflare 524 gateway timeouts
- Server Actions CSRF: use browser origin domain (`zhe.to`) in `allowedOrigins`, not `x-forwarded-host`
- D1 REST API batch format: semicolon-joined SQL with nested params array
- Worker sets `X-Forwarded-Host` to prevent Railway host override

## [v1.4.4] - 2026-02-28

### Added
- Folder/tag filter bar on "全部链接" page with folder single-select, tag multi-select (AND intersection logic), active tag badges, and clear button
- 11 filter bar tests covering folder dropdown, tag multi-select, intersection, clear, and combined filtering
- Basalt 24-color palette for tag badges with FNV-1a hash-based color assignment

### Changed
- Shrink header buttons (refresh, create link) to icon-only `h-7 w-7`, matching view-toggle size
- Merge header into single row: title, link count, filter dropdowns, view toggle, and action buttons all inline
- `LinkFilterBar` renders as Fragment instead of wrapper div for flexible parent layout

## [v1.4.3] - 2026-02-27

### Added
- `executeD1Batch()` function in D1 client for batching multiple SQL statements into a single HTTP request
- Shared `getD1Headers()` and `getD1Credentials()` helpers in D1 client
- HTTP keep-alive headers (`Connection: keep-alive`) for D1 client requests
- In-memory LRU cache for slug lookups in middleware (1000 entries, 60s TTL) to reduce D1 round-trips

### Changed
- Replace in-memory aggregation in `getOverviewStats()` with 9 parallel SQL-level queries using `COUNT(*)`, `SUM()`, `GROUP BY`, and `ORDER BY`
- Batch `recordClick()` INSERT + UPDATE into a single `executeD1Batch()` call instead of two sequential HTTP requests
- Pre-group `linkTags` by `linkId` in `LinksList` and `InboxTriage` parent components, eliminating O(N×M) per-card `.filter()` on every render

### Fixed
- Resolve public origin from `x-forwarded-*` headers in webhook route

## [v1.4.2] - 2026-02-26

### Changed
- Simplify `/api/live` to pure liveness probe — remove D1 database query for faster, dependency-free health checks

## [v1.4.1] - 2026-02-26

### Fixed
- Return `deletedKeys` from `cleanupOrphanFiles` to prevent UI desync when some keys are skipped
- Allow retry on batch metadata refresh failure and add `.catch()` to prevent unhandled promise rejection in `useAutoRefreshMetadata`
- Add 500-item upper bound to `batchRefreshLinkMetadata` to prevent unbounded input
- Add 5s AbortController timeout to `pushBackup` inline history fetch to prevent hanging requests

## [v1.4.0] - 2026-02-26

### Added
- Enhanced search dialog with rich UI, favicon, keyword highlights, and empty state
- `highlightMatches` utility with empty query guard for search filtering
- Unit tests for storage actions, dashboard actions, xray actions (including `fetchTweet`), R2 client (`listR2Objects`, `deleteR2Objects`), xray viewmodel, xray page, storage page, and storage route — all from 0% to covered
- Retrospective lessons for HighlightText DOM splitting and eslint-disable placement

### Changed
- Switch auth session strategy from `database` to `jwt` to eliminate per-request D1 HTTP calls for session validation, addressing p99 response time spikes
- Simplify search card layout with slug-only display, clickable folder, and merged meta row
- Replace EditLinkDialog with inline edit mode in inbox-triage and links-list
- Reduce meta row icon sizes to 9px for visual consistency
- Update search dialog tests for HighlightText DOM splitting

### Removed
- Unused draft state from `useInboxViewModel`
- Dead code: `edit-link-dialog.tsx` and its test (replaced by inline edit)
- Unused D1 debug script, PWA icons, `package-lock.json`, `vercel.json`
- Unused exports: `D1Response` type, chart palette exports, `BackyPushResult` interface, type exports from `models/types.ts`

### Fixed
- Use href selector for create-link E2E test (title may be enriched)
- Use input selector for note field in E2E edit test
- Update E2E tests for inline edit mode (no more dialog)
- Resolve lint warning and test collision in link-card after inline edit refactor

## [v1.3.1] - 2026-02-26

### Added
- Dashboard performance optimization (8 phases): unified auth helpers with `cache()` wrap, merged provider actions into single `getDashboardData()` call, SSR prefetch for 6 dashboard routes, batch metadata refresh, loading skeleton for page transitions
- Discord bot integration: model, actions, viewmodel, config page, webhook route, gateway route with cron-based WebSocket listener
- LinkCard children slot for extensibility
- Dockerfile and standalone output for Railway deployment

### Changed
- Reduce unnecessary dashboard context subscriptions (webhook, folders, sidebar, search dialog)
- Inline backy history on push success, skip refresh on failure
- Avoid full re-scan after storage cleanup (local state update with `computeSummary`)
- Simplify overview stats assignment (direct `setStats` instead of field-by-field copy)
- Replace InboxItem with LinkCard in inbox triage
- Centralize version via `APP_VERSION`, eliminate hardcoded fallbacks
- Remove Chat SDK integration and Bot page (replaced by webhook-based approach)
- Remove 4 unused radix-ui dependencies and dead context-menu component
- Remove debug logging from bot and webhook route

### Fixed
- Batch metadata refresh to eliminate N+1 per-card auto-fetch (50 links = 1 auth + 1 batch query instead of 50 auth + 150 queries)
- Await gateway listener promise directly instead of using `after()`
- Externalize zlib-sync for Vercel serverless compatibility
- Change gateway cron to daily (Vercel Hobby plan limitation)

## [v1.3.0] - 2026-02-25

### Added
- Xray bookmarks page with masonry layout and one-click link creation
- Sidebar reorganization into "系统集成" group with Backy, Xray, and file upload pages

### Changed
- Refactor xray actions: extract `xrayFetch()`, `buildCachePayload()`, `updateLinkFromTweet()` helpers to eliminate 4x duplicated fetch calls, 2x duplicated cache payloads, and 3x duplicated metadata/screenshot blocks
- Use masonry layout for bookmarks with inline add button
- Use white background for tweet cards instead of theme-dependent grey

### Fixed
- Auto-refresh backy history on mount and after push
- Restore correct `@radix-ui/react-scroll-area` version (1.2.10)
- Remove dead code: `clearResult`, `clearTestResult`, `clearPushResult`, `tweetToLinkMetadata`, unused `tweetId` return field
- Fix save button showing double icons during loading
- Fix redundant history conditional check
- Simplify MediaGrid ternary, merge UrlMode import, fix template literal

## [v1.2.2] - 2026-02-25

### Added
- Xray API page for tweet content fetching with media, quoted tweets, and preset URL selection
- Tweet cache system with D1 schema, migration, CRUD operations, and auto-integration into link creation and metadata refresh
- Auto-upload tweet images to R2 as link preview screenshots
- Backy remote backup feature: config, connection test, push, and history UI on data management page
- Backy server actions, viewmodel, and model with types, validation, masking, and tag builder
- Backy settings columns migration on user_settings table
- Webhook HEAD handler and enhanced GET with multi-method documentation
- Webhook stats types for richer endpoint responses
- Shared link UI components: DeleteLinkDialog, TagBadge, TagPicker, CopyUrlButton
- Shared `useLinkMutations` hook for unified tag query and mutation operations
- Link enrichment strategy pattern decoupling Twitter-specific logic from core CRUD
- Deterministic `tagColorFromName()` hash for name-based tag coloring
- Enhanced backup format with schema version, full link fields, and link-tag associations
- BackyPushDetail type with timing and request metadata

### Changed
- Refactor inbox-triage, link-card, and edit-link-dialog to use shared components (-334 lines)
- Refactor all tag UI to name-based coloring, fix search-command-dialog, inline list-mode tags
- Refactor tweet card: inline original tweet link, constrain max-width, preserve full image aspect ratio
- Split settings page into separate data-management and webhook pages
- Rename storage title and remove card width constraints
- Align backy UI with surety design system
- Rewrite README to reflect current project state

### Fixed
- Simplify tweet metaTitle to '@username posted on x.com'

## [v1.2.1] - 2026-02-23

### Changed
- Refine versioning workflow in CLAUDE.md: add version references checklist, default patch bump, display format convention (`v`-prefixed), and step-by-step release instructions

## [v1.2.0] - 2026-02-23

### Added
- Storage management page (`/dashboard/storage`) with R2 and D1 usage overview
- Orphan file detection — identify R2 objects not referenced by any D1 record
- Batch orphan cleanup with server-side double-validation before deletion
- Multi-select checkboxes with "select all orphans" capability
- R2 file list with CDN open button (`https://s.zhe.to/{key}`)
- Sort controls for R2 files by upload time and file size
- Summary cards showing total storage, database status, orphan count, and health
- D1 table stats with row counts
- `listR2Objects` and `deleteR2Objects` operations in R2 client
- `warning` and `success` badge variants
- Checkbox UI component (shadcn)

## [1.1.0] - 2026-02-23

### Added
- Fixed preview image for GitHub repository pages — all `github.com/{owner}/{repo}` URLs use a unified screenshot instead of per-link fetching
- On-demand preview fetch via toast-driven UI (replaced auto-screenshot)
- Refresh button in inbox header
- Playwright E2E test infrastructure with D1 global setup/teardown
- Playwright specs for landing, auth guard, navigation, and link CRUD
- Three-layer test coverage: page route tests, component interaction tests, and model unit tests

### Changed
- Unify link card display logic across list and grid modes (favicon, title, note, description, thumbnail)
- Replace raw URL display with clickable title and copy button
- Move screenshot fetch to server action to avoid CORS blocking
- Grid mode meta row now shows slug, click count, and date consistently

### Fixed
- Restore slug display in grid mode meta row
- Return final redirect URL from screenshot.domains for reliable server-side download
- Isolate E2E tests on dedicated port to avoid dev server conflicts
- Use platform-aware modifier key for Cmd+K test
- Harden E2E credentials provider with email pin and production guard
- Use else-if in session callback to prevent id overwrite

## [1.0.0] - 2026-02-20

### Added
- Short link creation with auto-generated and custom slugs
- Click analytics tracking with device, browser, and referrer breakdowns
- Dashboard with overview stats, click trends, and top links
- Folder system for organizing links with sidebar navigation
- Tag system with color-coded badges and link-tag associations
- Inbox triage view for uncategorized links with inline editing
- File upload with drag-and-drop, R2 storage, and presigned URLs
- PNG-to-JPG auto-conversion with configurable quality
- Link editing dialog with slug, tags, notes, and screenshot URL
- Search command dialog (Cmd+K) with meta, note, and tag search
- Preview style setting (screenshot vs favicon) per user
- Auto-fetch metadata (title, description, favicon) for new links
- Screenshot proxy through R2 for permanent URLs
- Webhook support for external integrations
- Health check (`/api/health`) and liveness probe (`/api/live`) endpoints
- Auth.js authentication with D1 adapter
- Row-level security via ScopedDB
- MVVM architecture with models, viewmodels, and hooks
- Three-layer test suite: unit, component (RTL), and E2E
- Git hooks via husky: pre-commit (UT + lint-staged), pre-push (full test + lint)
- Basalt design system with dark/light theme toggle
- Badge-style login page with themed logo
- Responsive sidebar with collapsed/expanded modes and mobile overlay

### Security
- SSRF defense on screenshot save with protocol whitelist, timeout, and size limit
- R2 key ownership validation to prevent cross-user deletion
- D1 error message sanitization to prevent internal detail leakage
- TOCTOU race elimination in link import via UNIQUE constraint handling

### Performance
- SQL-based analytics aggregation (replaced JS loops)
- Singleton EditLinkDialog (eliminated per-card instances)
- React.memo on LinkCard to skip unnecessary re-renders
- Dual-context split for DashboardService (state vs actions)
- COUNT(1) query for slug existence check
- Composite indexes for analytics aggregation and upload listing
