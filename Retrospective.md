# Retrospective

Historical accident narratives and project lessons. Current requirements live in [AGENTS.md](AGENTS.md). Preserve original dates and wording; deterministic follow-ups belong in tests/hooks and cross-project lessons in global rules/nmem.

## Undated collection — migrated from the previous handbook

Some entries contain their original incident dates. Entries without dates remain undated.

- **Atomic commits**: Never bundle multiple logical changes (infra, model, viewmodel, view) into a single commit. Always split by layer/concern, even if they're part of the same feature. Each commit must be independently buildable and testable.
- **E2E port isolation**: BDD E2E tests must use a dedicated port (27006) separate from the dev server (7006). Never reuse an existing dev server for E2E — Playwright always starts its own with `PLAYWRIGHT=1`. This avoids env-var mismatch bugs where the CredentialsProvider is missing.
- **Version bump find-replace safety**: When bumping versions in `package.json`, never use naive substring replacement (e.g. `sd '1.2.1' '1.2.2'`) because it can corrupt dependency versions (e.g. `^1.2.10` becomes `^1.2.20` when `1.2.1` is matched as a substring). Always use targeted edits scoped to the `"version"` field, or use word-boundary-aware regex.
- **HighlightText breaks `getByText`**: When a component splits text across multiple DOM elements (e.g. `<span>zhe.to/</span><mark>abc</mark>`), `screen.getByText("zhe.to/abc")` fails because no single element contains the full text. Use `data-value` attributes on parent elements (e.g. `[cmdk-item][data-value="slug"]`) to locate items, then assert on `element.textContent` which concatenates all child text nodes.
- **eslint-disable placement**: `// eslint-disable-next-line` only suppresses the immediately following line. If placed before a variable declaration but the lint violation is on a JSX return two lines below, it has no effect and creates an "unused eslint-disable" warning. Always place the directive directly above the offending line.
- **Next.js `allowedOrigins` checks the browser `Origin` header, not `x-forwarded-host`**: When a reverse proxy rewrites `x-forwarded-host` (e.g. Railway sets it to `origin.zhe.to`), the CSRF check compares `x-forwarded-host` against the browser's `Origin` header (`zhe.to`). On mismatch, it calls `isCsrfOriginAllowed(originDomain, allowedOrigins)` where `originDomain` is from the browser `Origin` — so `allowedOrigins` must contain the **browser domain** (`zhe.to`), not the forwarded host (`origin.zhe.to`). Always read the actual Next.js source (`action-handler.js`) to verify which value is checked.
- **E2E cross-spec data pollution**: Serial Playwright specs that assume empty state (e.g. "no uploads") will fail when another spec seeds data into the same table and global teardown only runs at the end. Always add a `beforeAll` cleanup (`DELETE FROM <table> WHERE user_id = ?`) at the start of serial specs that depend on empty state, even if global teardown handles cleanup eventually.
- **Playwright `getByText` substring matching in tables**: `getByText('GET')` inside a `<table>` can fail when the same text appears as both an exact cell value (`<td>GET</td>`) and a substring in another cell (`<td>Get status, stats & API schema</td>`). Use `{ exact: true }` to restrict matching to elements whose entire text content equals the search string. Similarly, use `.first()` when multiple `<pre>` blocks in a documentation section all contain common terms like "curl".
- **vitest 4 `vi.fn()` arrow-function constructor breaking change**: In vitest 4, `vi.fn().mockImplementation(() => ({...}))` no longer works when the mock is called with `new` — it returns `undefined` instead of the object. Must use `vi.fn().mockImplementation(function() { return {...}; })` (regular function) for any mock that will be `new`'d (e.g. `ScopedDB`, S3 clients).
- **Biome `useArrowFunction` vs vitest constructor mocks**: Biome's recommended `useArrowFunction` rewrites `function () { return {...} }` into `() => ({...})`, which re-introduces the vitest 4 `new` breakage above. Keep `complexity/useArrowFunction: "off"` under the `tests/**` biome override (see `biome.json`). Never re-enable it for tests without auditing every `mockImplementation` used as a constructor.
- **TypeScript 7 + Next.js needs `@typescript/native-preview`**: TS 7.0.2 no longer ships `typescript/lib/typescript.js`. Next.js 16.2.x `verifyTypeScriptSetup` fails with "required package(s) not installed" unless `@typescript/native-preview` is installed (activates the `hasNativeTypeScriptPreview` / `tsgo` branch). Pin both `typescript@7.0.2` and `@typescript/native-preview` together.
- **vitest 4 `coverage.all` behavior change**: vitest 4 removed the `coverage.all` option and now automatically includes all files matching `coverage.include` globs, even if no test imports them. This means `app/**/route.ts` in `coverage.include` pulls in all API route files at 0% coverage, tanking the overall percentage. Solution: remove `app/**/route.ts` from `coverage.include` since API routes are tested by L3 E2E tests, not L1 unit tests.
- **`bun update --latest` can jump major versions unexpectedly**: Running `bun update --latest` on packages like `eslint` or `@types/node` can jump to incompatible major versions (e.g. eslint 9→10, @types/node 22→25). Always verify the installed version after `--latest` and pin to the correct major if needed.
- **Preset configs lock you to the slowest transitive plugin**: `eslint-config-next@16` pulls in `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, and `eslint-plugin-import` as transitive deps. When eslint 10 removed `context.getFilename()` / `context.getSourceCode()`, `eslint-plugin-react@7.37.5` crashed on load (`TypeError: contextOrFilename.getFilename is not a function`) and the preset stayed unusable until jsx-eslint shipped a fix (`PR #3979` was still open weeks later). For an infra cliff like this, **don't patch node_modules** — the patch becomes a maintenance burden and rots after the upstream fix lands differently. Hand-roll the flat config from per-plugin sources instead. (2026-06-22: did this in two passes. Pass 1 swapped to `@next/eslint-plugin-next` + `eslint-plugin-react-hooks` + `typescript-eslint` only — fast to ship but lost ~32 rules. Pass 2 restored coverage by adopting drop-in replacements that are already ESLint-10-native: `@eslint-react/eslint-plugin` for react/, `eslint-plugin-jsx-a11y@6.10.2` (stale peer but no deprecated context API in source — works fine), and `eslint-plugin-import-x` for import/. End state: equivalent-or-better rule coverage than the original preset, plus RSC rules the legacy plugin never had, and no transitive dependence on jsx-eslint's release cadence.)
- **`eslint-disable` directives are namespace-scoped, not rule-name-scoped**: When two plugins ship the same rule under different namespaces (e.g. `react-hooks/exhaustive-deps` vs `@eslint-react/exhaustive-deps`), an `// eslint-disable-next-line react-hooks/exhaustive-deps` comment only silences the first; the second fires independently. Two ways out: (a) name *both* in the disable comment, which makes every disable site carry the dual list forever, or (b) pick one plugin as authoritative and turn the duplicate **off** in `eslint.config.mjs`. (b) is the right default — duplicated rules mean duplicated noise, not extra safety. (2026-06-22: started with (a) for `@eslint-react/exhaustive-deps`, then switched to (b) — `react-hooks` is authoritative, `@eslint-react`'s copy is `off`. Same applies to set-state-in-effect, web-api/no-leaked-*, etc.)
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
- **Dashboard controls: reuse density primitives, never restyle ad hoc**: Toolbar compact = `Button size="sm"` + field `size="sm"` (32px). Form secondary = `Button size="default"` (36px). No `xs`/`icon-sm`, no `h-7`/`rounded-lg` patches or raw checkboxes. Full contract: `docs/22-design-tokens.md`.

## 2026-09-21 — X card category collapsed after adding visibility controls

Adding a visibility button consumed the remaining width in the six-column X card footer. The category container could shrink to zero, so the folder name disappeared at a 1365px viewport. The full release preflight caught this before publication; the focused visibility tests had used uncategorized cards and did not exercise a long folder name with tags. Give the category a minimum width and let the action group wrap, with smaller row gaps to preserve the existing footer height budget. Keep the existing desktop and mobile Connector browser checks as regression coverage.

## 2026-09-21 — Initialize hooks in isolated release worktrees

The release worktree copied dependencies without running package preparation, leaving the ignored `.husky/_` wrappers absent. Git therefore created the local layout-fix commit without hooks. Before any push, initialize Husky, return only that unpublished commit to the index, and recreate it through the normal hooks. Run package preparation when creating a worktree with copied dependencies, and verify the generated hook entrypoints before committing.

During recovery, starting the commit while the mobile browser check was still running triggered the hook's typecheck rebuild, which cleared Next.js output and invalidated active Server Actions. The mobile result was therefore discarded. Run browser checks and hooks sequentially in a shared checkout; typechecking can include a production build even when its name suggests a read-only check.

## 2026-09-21 — Reused an existing model filename during Connector UI work

An Add File patch replaced `models/enrichment.ts` before checking whether the path already existed. Type checking caught the missing `LinkEnrichmentStrategy` export before commit or deployment. The original file was restored byte for byte, and the Connector task models moved to `models/connector-activity.ts`. Check exact target paths and tracked contents before adding a file, even when the patch tool accepts Add File.

## 2026-09-21 — Enrichment actions exceeded collection layout limits

The new enrichment button made the grid action strip wider than a narrow card, placing the hide control outside its clickable area. Added header actions also let active filters collapse the page heading. The complete release preflight caught both regressions before publication; focused dialog checks did not cover these existing flows. Bound and wrap the grid actions, and use Basalt's existing filter row for desktop filters. Progress updates initially missed failures embedded earlier in the test log; use the final report or inspect the complete failure list before stating that a run has no failures.

The required post-release browser job then failed twice because the wrapped AI button covered the X preview's center. Cleanup masked the original click timeout in the console; the trace identified the intercepted pointer event. The focused layout rerun had omitted the Connector journey after the wrapping change. Spread wrapped controls across the row to keep the center clear, and check preview clicks across desktop breakpoints in that journey. Preserve the published v2.1.3 tag and verify this follow-up commit separately.

During the v2.1.4 display-layout preflight, a later Connector assertion still expected six columns at 2560px. Its failure skipped the following mobile case because the file runs serially. A progress update incorrectly treated that case's numbered log entry as a pass; the final report exposed the skipped case and the update was corrected. A listed test is not a result: check the final passed, failed, and skipped counts, then rerun the entire affected serial file.


## 2026-09-23 — Browser retries and obsolete runtime probes hid failures

PR #944's green CI contained ambiguous skeleton locators and an oversized Connector journey that exhausted its 90-second budget. Cleanup inside the test then replaced the useful timeout location with an API-delete error. Select the accessible loading status during streamed rendering, split independent journeys with isolated fixtures, and let fixture teardown retain its own budget. Preserve every behavioral assertion and fail CI when a retry is needed.

Fresh main CI 35667427687 also lost its Wrangler 4.116.0 and 4.118.0 browser processes despite reporting success. The internal log identifies `Network connection lost.` in `ProxyController`, matching cloudflare/workers-sdk#14926. Upstream PR #15252 (682cd44fcd18940e143b2c63bb7ebf17f3254531) added request recovery and nonfatal proxy error reporting; both are present in the repository's locked Wrangler 4.135.0. The ordinary CI matrix still globally installed old versions instead of testing that dependency. Install the frozen Worker lock for L2/L3, remove the obsolete experimental lanes and their error suppression, and inspect full test completion and actual child version before accepting a green aggregate. The manual stress workflow uses the same frozen runtime instead of defaulting to the broken versions; it was not dispatched for this repair. Historical stress runs remain diagnostics, not acceptance evidence for another revision.

During preparation, `bun x biome` ran before the frozen dependency installation had completed and fetched an unrelated executable. No source or lockfile change from that invocation was accepted as validation. Subsequent checks used the installed project binary directly. Verify installation success and local executable availability before invoking package runners.

The zero-retry local L3 run on 4ff825e timed out in the X skeleton's five-width sweep at card-reflow.spec.ts:218; Wrangler 4.135.0 remained alive. The owner then narrowed browser coverage to main journeys and authorized deleting unstable edge checks. Removed the duplicate skeleton breakpoint sweep while retaining loading-to-card transitions, the independent real-card breakpoint tests and all timeout thresholds. The superseded run was stopped normally after 63 passes, one failure and one interrupted case; 146 cases did not run. It is diagnostic evidence, not a completed validation gate.

CLI validation on 17063945 exposed a fake-clock race in the OpenCLI contract suite: the bridge connects before asynchronous adapter imports register the 1200ms delay, so advancing time immediately after connection can leave the later delay pending until the unchanged 5s test timeout. Two runs failed in different cases sharing that helper. Wait for timer registration or early cleanup before advancing the clock; retain the main-flow assertions and production behavior. A diagnostic invocation appended a test filename to the compound package script and therefore ran the full suite; use the installed Vitest binary for file-filtered runs.

The link-card motion L3 test captured its origin while the parent was still 12px below its final position. `seedCard` waited on the card's immediate inner wrapper, but `animate-fade-up` belongs to an outer ancestor. Resolve and await the actual animated ancestor before measuring geometry; keep all motion assertions and tolerances unchanged.

## 2026-09-23 — Linux skeleton geometry sampled during loading handoff

PR #944's GitHub skeleton check observed the visible loading container, then a separate geometry read sampled a pulse-card height of zero; the retry showed the expected skeleton. Poll columns and height together until one sample has positive height, then use that same sample for the original exact geometry checks. The first-attempt DOM transition was not traced, so the handoff is a supported diagnosis rather than a directly observed replacement. Keep wrong nonzero geometry failing and preserve all collection, motion and entrance assertions.

## 2026-09-23 — url-metadata security upgrade

`url-metadata` 5.x pins the vulnerable `request-filtering-agent` 2.0.1; the reviewed 6.0.0 release updates that protection and requires Node `^20.19.0 || >=22.12.0`. Keep real-library localhost coverage for default private-IP blocking as well as the explicit allow-list used by the parsing smoke test. Install with lifecycle scripts disabled in this checkout; never run Husky preparation or alter shared Git hook configuration.

## 2026-09-24 — Isolated browser validation needs a test auth secret

The first focused CI-matrix validation started from a clean checkout without an `AUTH_SECRET`. Authentication setup failed and none of the 33 browser cases ran. Unlike the API runner, Playwright does not supply a default secret. Pass a local-only test value in the runner environment before starting the browser stack; never copy production credentials to make isolated tests work.

The first pre-commit then caught stale copied dependencies: matching source manifests did not mean the copied installation matched the lockfile. The installed `url-metadata` 5.12.0 still used `request-filtering-agent` 2.0.1, so the private-IP asynchronous rejection test failed. A frozen install restored the locked versions without changing the lockfile. Run a frozen install after copying dependencies, and repeat affected validation when the installed versions change.

## 2026-09-24 — Browser matrix reduction exposed a separate search failure

CI 35935523312 on `e2e9ae38` passed 203 browser cases and rejected one flaky 390px enriched-search replay. Its failure screenshot showed the real generic search-service error after selecting GitHub; the first-attempt network trace was not captured, so the backend cause remains unproven. Deduplicate the identical desktop/mobile keyboard and backend journey while retaining mobile layout checks in the remaining case. This reduces repeated work; it does not establish that the search-service error was fixed. Keep flaky-result rejection and the desktop source-filter assertions.

CI 35936672879 on `758a6842` then passed 202 cases and rejected the X deletion-animation case as flaky: the final horizontal position sampled 297.3px instead of 292px, and its retry passed. The test pauses and seeks Web Animations before sampling coordinates; the available failure does not prove a product animation defect or its absence. Remove this frame-by-frame X replay while keeping X masonry checks, bulk deletion database assertions and archived-media cleanup acceptance.

## 2026-09-25 — Icon actions must preserve their accessible names

During the X toolbar conversion, an inherited `aria-label={undefined}` could override the new icon action's label after its visible text was removed. Review caught this before publication. Apply the required accessible name after forwarded props, and retain the enrichment toolbar's accessible-name test when changing shared controls. A separate local typecheck encountered a malformed generated Next.js validator; asking the running dev server to regenerate it restored validation without changing application code or stopping daily development.

The first browser run exposed an ambiguous new test locator: Playwright substring matching selected both hide and unhide buttons. Use exact accessible-name matching for opposing actions whose labels overlap; preserve both actions and their end-to-end assertions. The full suite also retained a header-only locator in the X bulk-delete journey; update every toolbar consumer when changing its placement, including deletion and focus-restoration checks.

### 2026-09-25 — Card overflow and menu focus

The iPhone-width list reproduction showed six independent action controls
compressing the content below 80px while metadata overlapped them. A viewport-only
fix would miss the equally narrow cards in desktop multi-column grids. Shared
card-width observation now controls secondary action overflow across layouts.

During verification, moving the X details action into a portal menu exposed a
focus-return assumption: the saved active menu item disappears when the menu
closes. The shared action menu now closes and restores its stable trigger before
invoking a selected secondary action, so dialogs inherit a valid return target. Tests also distinguish the temporarily aria-hidden
background trigger from the exposed menu instead of querying it as an accessible
button while the modal menu is open. Verify the whole menu-to-dialog round trip
whenever an action changes its presentation.

Full regression caught a desktop sizing detail: replacing a fixed 44px footer
with min-height allowed its border to add one pixel. The original desktop height
is retained; only coarse-pointer layouts grow to fit 44px touch targets. The
reflow test also has to finish its deliberately paused overlapping animation
before clicking a new menu, rather than treating a read-only state assertion as
an interaction during the overlap.

The complete connector journeys also exposed an inventory omission: X bookmarks
appear in the generic link grid/list, not only in the dedicated X feed. Their
primary action must remain the details control, including its enrichment status
description. Editing moves to More for those records; normal links keep Edit.

A validation scheduling mistake ran `next build` alongside Playwright. Production
build cleanup removed the nested `.next/test/dev` directory, restarting the test
server during an AI tag action. Separate distDir names are insufficient when
one lives under the other's cleanup root. Production builds must finish before
L2/L3 begins; the interrupted browser run is not accepted as verification. The
daily HTTPS development server remained reachable after its automatic recovery.

The full browser suite found two remaining test assumptions: a reveal click was
followed by action lookup before the list and its responsive controls settled,
and an upload assertion still searched inside the card for a portaled menu link.
Wait for the restored card count and reflow completion before interacting; open
the menu and retain the original link target and URL assertions there.

A clean test cache restored the media upload route after it had returned an HTML
404 despite its source being present. The resumed journeys exposed a real narrow
grid issue: the preview center overlapped top-right controls at 768px with the
sidebar expanded. Shared link previews and their skeletons now retain a 112px
minimum height. Mobile notifications reserve space above the floating bulk bar
so a hovered toast cannot indefinitely obstruct its exit control. Browser helpers
wait for the documented responsive width mode and scope portaled menus to the
correct page, including secondary tabs.

## 2026-09-26 — Release gate routing and duplicate work

Repeated full runs misdiagnosed a Next development routing defect as stale cache.
A three-request reproduction showed that compiling the dynamic connector parent
first makes Turbopack return HTML 404 for its media child; reversing request order
returns 401. Webpack returns the expected 401 in parent-first order. L2/L3 now
use Webpack and setup checks that order before browser journeys. Production
continues to use its existing compiler. The test output is a sibling of `.next`
so production cleanup cannot remove it. A 43.999938px measurement also failed an
exact 44px assertion; geometry checks now round only sub-millipixel noise.

Separate branch/tag pushes ran the same HTTP and dependency gates twice. One
atomic push retains the normal pre-push hook and publishes both refs together.
Failed or retry-only browser runs block publication and stop promptly. Diagnose
with the smallest failing request sequence before repeating the complete suite.

The isolated three-request Webpack probe passed, but full startup still omitted
the media route from generated route types. That falsified the narrower
Turbopack-only diagnosis. L2/L3 now use a complete build and `next start`, with
the same parent-first regression check. Browser setup signs loopback-only test
sessions; production authentication code and its bypass prohibition stay intact.

Startup also spawned Wrangler once per migration. Ordered batching cuts those
36 processes to five without combining either tolerated missing-column migration
with strict migrations. Tests assert the real migration list is preserved exactly;
the full local schema is exercised by HTTP/browser gates.

### 2026-09-26 — Bound interruption checks independently

The pre-commit cancellation regression combined TERM, INT and HUP fixtures under one 30-second deadline. Full-suite contention exhausted that shared budget even though each case passed alone. Split the signals into independently timed cases and subscribe to child exit before sending the signal, preserving every exit-code, child-termination and snapshot-cleanup assertion. Keep the Next-generated test development type include so complete test builds do not dirty the maintained configuration.

The next full run exposed a separate three-second child-readiness deadline under concurrent repository builds. Cap Vitest at four workers to reduce process and memory contention; allow ten seconds for fixture startup and clear readiness timers immediately on success/error. Shutdown escalation and completion deadlines remain unchanged.

### 2026-09-26 — Creation entry focus and shell fixture boundaries

The shared creation FAB introduced a dialog child into the shell's unit fixture. That fixture mocked its previous server boundaries but loaded the new child's Auth.js dependency under Node, failing before tests ran. Mock the creation child at the shell boundary; exercise its real dialog in the dedicated component and browser suites. WebKit additionally showed that tapping a button does not necessarily focus it. Focus the FAB with `preventScroll` before invoking its action so programmatic dialogs capture a valid return target on iPhone.

### 2026-09-26 — Update existing creation journeys with the FAB

The new FAB browser regression passed, but the full gate caught an existing Ideas empty-state test still expecting the former top-button instructions. Audit existing copy assertions and creation locators whenever moving a shared entry point. Update the empty-state contract and remove `.first()` from creation locators so duplicate creation buttons fail instead of being hidden by the tests.

### 2026-09-26 — Migrate both test authentication clients

Switching L2/L3 from development servers to production builds disabled the development-only Credentials provider as intended. Browser setup was updated, but the HTTP helper still called that provider and its provider-list test still required the bypass. The pre-push gate rejected five tests before either remote ref was published. Use signed sessions only after asserting the exact loopback origin in both test clients; verify production providers exclude the test login and real HTTP rejects tampered sessions. Audit all authentication callers when changing test server mode.

## 2026-09-30: Preserve the original overlay failure

The stress run failed on touch dismissal and a closed dialog that remained
visible, but tracing only the first retry retained passing traces. A failed
screenshot can also finish animations before it captures the page. A diagnostic run retained
failed-attempt traces and attached the overlay's state, focus, computed animation
and timeline before the failure screenshot. Keep the original assertion and
error intact. Local targeted runs passed without reproducing the hosted failure;
these diagnostics do not constitute a causal repair.

The normal push hook blocked this diagnostic branch on eleven Undici 8.10.0
advisories. Pin the existing root override to fixed 8.10.2 and preserve the
blocking scanner; the isolated HTTP tests and security scan must pass before
collecting hosted evidence. This dependency repair is not an overlay fix.

The hosted diagnostic trace showed the grid case exhausting its test budget
after every mobile assertion, during an unused final desktop resize. Only list
mode has assertions at that viewport, so keep the resize inside that branch.
The repeated menu cycle also sent its outside tap immediately after reopening
without confirming the menu had appeared. Assert completed dismissal, restored
trigger focus and reopened visibility before the next gesture. Preserve all
viewport assertions and time budgets. Restore the original trace strategy for
verification: recording every action changes timing and is not a repair. The
separate dialog exit observation still needs matching first-attempt green proof.

The independent Worker lockfile resolved the same vulnerable Undici 8.10.0
despite the root patch. Pin that existing override to 8.10.2 as well and verify
all three lockfiles separately; a green root-only scan does not certify the
Worker or CLI graph. No scanner exclusions or permissions changed.

### 2026-09-30 — Isolate overlay browser fixtures without dropping resize coverage

The first sequencing correction passed ordinary CI but Stress run 36648405388 still reported a grid case exceeding its 30-second budget and a closed global-create dialog remaining visible. Failure-only evidence captured its exit animation still at time zero after the original five-second assertion. This does not establish a normal exit-duration problem and does not justify a longer timeout or disabled motion.

The card test repeated its complete interaction sequence at four widths inside one case. Each width now has an independent case and browser context, while dedicated same-page resize cases retain touch, geometry, dismissal and focus continuity across all four widths. The complete keyboard sequence still runs at every width. Global-create keeps its existing live-resize and reduced-motion checks, uses a per-test authenticated owner, and seeds 28 links to preserve the observed populated-page workload without another worker mutating that owner's data. Hosted Stress remains required to determine whether this isolation correction resolves the failure. No timeout, retry, worker, motion, workflow or flaky-test gate was relaxed.

The first local continuity test used a role locator for the trigger while its modal menu was open. Radix hides the background from the accessibility tree in this state, so the assertion could not resolve the still-present trigger. The assertion now uses the same scoped DOM locator as the existing interaction test; accessibility locators remain in place for the visible trigger and menu items.

The corrected local run passed 51 cases, then an unchanged iPhone selection assertion observed scroll position 449 instead of 450 after Escape, leaving the final two global-create cases unexecuted under the existing fail-fast limit. This distinct fresh observation is recorded without relaxing the exact scroll assertion or changing selection behavior. A bounded isolated validation covers that observation and the unexecuted global-create cases; full hosted verification remains mandatory.

The isolated candidate selection check repeated the one-pixel failure. The fixture extraction was then reduced to the original lazy fixture, original user metadata and original authentication ordering; global-create explicitly requests it in beforeEach. An unmodified baseline selection probe and both global-create scenarios passed together; the temporary probe was removed. This comparison does not establish a product scroll fix. The final extracted-fixture candidate still requires its own full local and hosted verification.

The normal commit hook rejected the extracted fixture import order after all behavioral and type checks passed. The import was sorted explicitly and the full normal hook rerun; no check was bypassed.

### 2026-10-01 — Unique owners do not isolate globally unique slugs

A four-worker run selecting card-actions and global-create started Chromium and iPhone card cases together and failed before UI interaction with a D1 UNIQUE constraint. The same head had passed all 255 cases in the full suite, where scheduling separated those cases. Migration 0000 defines links_slug_unique on slug alone; distinct test owners cannot protect the fixed responsive-card slug.

Both responsive and live-resize card fixtures now suffix the long slug with their per-test owner. This preserves long-text layout pressure and all existing assertions while isolating the actual global database key. No schema, timeout, worker count or production behavior changed. Overlay lifecycle diagnostics remain a separate investigation; this collision fix does not establish that the original hosted dialog-close failure recovered.

### 2026-10-01 — Preserve overlay event chronology before proposing a lifecycle fix

Fresh preflight still found no main Stress recovery and the owned Draft retained its failed exact head. The unchanged 255-case suite passed locally with four workers and no retries, so another local green would not establish a hosted fix. The prior failure snapshot showed a closed visible dialog with exit animation time zero, but a single snapshot cannot distinguish an unstarted timeline from repeated restarts or dropped completion events.

The affected tests now install a bounded passive event recorder before navigation. It records animation, overlay node/state, pointer and focus events without style, geometry, animation-object reads or frame loops on the successful path. Failure capture adds pending/start/timeline timing and the event buffer; afterEach also captures focus assertion failures while preserving the original failed result. This adds observation overhead, not a claimed zero-cost or causal repair. No timeout, assertion, retry, worker count, motion or application behavior changed.

A temporary fixed-320px cold-close control passed. A separate deliberately paused synthetic exit correctly failed and emitted its state and event history; the probe was removed. Its first temporary filename did not match the project's explicit iPhone file selector, producing no tests; discovery was checked before the corrected run, without broadening the selector. Frozen dependency installation used the permitted Tencent mirror after corporate mirror package 404s.

The first instrumented targeted run passed 53 cases but observed the already-known one-pixel selection-scroll mismatch (449 versus450). The exact selection assertion stayed unchanged. Recording was narrowed to the actual overlay-interaction cases instead of installing event listeners in the unrelated selection test, and unrelated sidebar/skeleton animations are excluded from its bounded history. This scope correction does not claim the recorder caused or fixed the scroll observation.

### 2026-10-01 — Separate responsive and runtime-motion test budgets

The first hosted event run passed ordinary CI but Stress cell 5 exhausted the 30-second global-create test budget during its final reduced-motion action. Its complete event buffer showed five ordinary closes receiving one animation start/end pair, node removal and focus restoration each; event delivery was delayed roughly 1.2–3.0 seconds. The final click took about 12 seconds, and no dialog existed in the timeout snapshot. This evidence does not show Presence rejecting completion, nor prove that an earlier closed-visible failure is permanently fixed.

The five-width live-resize keyboard journey remains one unchanged assertion sequence, with explicit dialog visibility/open-state checks before keyboard interaction. Runtime reduced-motion switching now has its own case and unchanged 30-second limit. That case retains all five viewport changes, a normal open/close, the original closed-state preference change and mouse click, and the exact no-animation assertion. It also checks preference changes while the dialog stays open and reduced-motion dismissal/focus return. Per-case user/data isolation is retained; no timeout, retry, worker count, motion implementation or workflow is relaxed. Fresh hosted verification must still exercise all original scenarios and both new browser cases on their first attempt.

The first combined local run after this separation passed 55 cases and repeated the unchanged iPhone selection assertion at 449 versus450. The selection body and exact equality remain untouched. Validation narrows to all modified global-create scenarios instead of rerunning the unchanged broad group for a green sample; the full 257-case hosted gate still includes selection and must pass before merge.

### 2026-10-01 — Finish outside touch before restoring menu focus

The hosted Chromium live-resize failure recorded trigger focus restoration at 1700ms, followed by focus loss at 1707ms and the same gesture's native background click at 1710ms. The overlay had already been removed. This establishes an early touch-dismissal race rather than missing Radix autofocus. A native CDP touchStart regression reproduced immediate dismissal before touchEnd on the previous head.

CardActions now prevents only primary outside-touch dismissal through the supported public callback and closes its controlled menu on the native document click. Matching pointer cancellation removes the pending listener without closing; replacement gestures, every open-state transition and component unmount remove pending listeners. Mouse, keyboard, menu selection and existing close-autofocus behavior remain intact. No timers, forced focus, animation changes, unsupported dependency props or vendor patches are used. Native light/dark touch completion and cancellation pass locally; component tests cover mismatched cancellation, Escape/reopening and listener cleanup. The separate WebKit dialog-exit failure remains unresolved pending fresh hosted evidence.

The normal commit hook rejected the first candidate at 94.99% branch coverage against the unchanged 95% threshold. Mouse/non-primary outside-pointer behavior now has direct regression coverage, and the event callback uses the application's document without an unreachable detached-root guard. The complete normal hook is rerun; no threshold or exclusion changed.

### 2026-10-01 — Distinguish assertion capture from afterEach capture

Inspection of the installed Playwright worker found that its automatic failure screenshot callback runs before afterEach. The shared attachment name incorrectly described afterEach snapshots as before-screenshot evidence. Late animation completion seen only in those snapshots therefore cannot establish natural scheduler recovery: screenshot processing may have affected it. Earlier in-function catches precede the automatic failure screenshot; the observed touch focus race also occurred before the original assertion timed out.

Every overlay attachment now declares its actual assertion-catch or after-test-function phase. Both dialog-close/focus sequences in the new runtime-motion case, the original keyboard loop, and live-resize menu focus failures capture inside the original assertion catch before rethrowing. An existing assertion-catch attachment prevents a later duplicate capture. Successful paths retain passive event recording without added style reads. This is a diagnostic correction, not a fix for the separate hosted WebKit exit failure.

### 2026-10-01 — Do not wait for a touch click that an engine may never emit

The click-deferred candidate passed native Chromium and local macOS WebKit interactions, and both independent reviews accepted it conditionally. Hosted Linux WebKit then failed all three attempts of the first outside-touch case: pointerdown and pointerup reached HTML, no click followed, and the menu remained open. The five Stress cells also rejected this candidate. Local cross-engine coverage did not prove equivalent platform event delivery, and the earlier green checks could not authorize merge.

The correction removes the added listener state machine entirely. The public outside-pointer callback cancels the original primary touch PointerEvent default while leaving Radix's custom outside event uncancelled, so native immediate dismissal continues. Pointer Events defines this cancellation as suppressing compatibility mouse events such as mousedown; it does not suppress click/auxclick/contextmenu and is not a general background-activation guarantee. The observed focus loss was caused before the trailing click, and a native held-touch regression now reproduces the actual loss after touchEnd with original application behavior. The corrected handler passes that light/dark regression without waiting for click, adding timers, forcing focus, changing motion or detecting browsers.

The earlier new regression's requirement to remain open during touch was tied to the rejected implementation. It now verifies immediate dismissal, trigger focus before and after touch completion, cancellation without later focus loss, and keyboard close after reopening. Original repository assertions remain intact. Component tests directly check original-event cancellation for primary touch and unchanged mouse/non-primary behavior; tests of the removed listener implementation are removed with it. Fresh hosted CI and all five Stress cells remain mandatory. The separate dialog-exit issue remains unresolved.

### 2026-10-01 — Honor reduced motion in the closed dialog state

The corrected touch candidate passed all card cases in ordinary CI and all five Stress reports, but the independent WebKit dialog case remained flaky. One failed retry had already asserted reduced-motion animation:none while open, then captured basalt-dialog-out pending at time zero after Escape. Actual built CSS showed why: the closed-state utility has class-plus-attribute specificity, exceeding the reduced-motion utility, while the application's unlayered reduced-motion override matched only data-state=open.

The existing override now matches .create-dialog[data-state] inside the reduced-motion media query. Keeping the attribute maintains specificity against the application's own open-entry rule; a bare .create-dialog selector would lose that open-state override. Normal preferences retain both existing animations. A browser regression reproduces the old closed-state CSS value using the real dialog class on an owned temporary plain element, checks both states and preferences, removes the element, and also verifies real Escape dismissal and focus return. This corrects creation-dialog content only; it does not certify every Basalt overlay or fix the still-unproven normal-motion WebKit scheduler issue. No normal animation, time limit, retry or workload is removed.
