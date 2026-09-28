# Local application environments

Shared contract: [system0-envs](../../workflow/tasks/system0-envs/SKILL.md).

## Entry points

```sh
bun run dev                         # remembered choice, otherwise Demo
bun run dev --mode demo             # explicit initial choice
bun run dev --mode e2e              # switchable manual E2E
bun run dev --build --mode demo     # locally served production build
bun run demo:reset                  # requires the Demo instance to be stopped
bun run test:api
bun run test:e2e:pw
ZHE_DATASET=demo bun run test:e2e:pw --project=capture
bun run scripts/verify-local-switching.ts
```

Interactive preview is `https://zhe.dev.hexly.ai`, through the existing Caddy
mapping to 7006. `--port 7007` uses `http://localhost:7007` for an independently
selected local entry; do not start two interactive apps sharing `.next-local`.
The application remains the normal Next.js app. The local launcher owns the
switching endpoint; hosted Next.js servers have no switching endpoint.

Demo persists in `.demo-storage`. Reset checks ownership and refuses a live lock.
The launcher never deletes historical `.test-storage` or daily user databases.
Manual E2E owns `.test-storage/runs/<uuid>` and removes that directory on exit.
Reentry creates a different UUID. Demo catalog upgrades require explicit reset.
A stale Demo lock after an ungraceful process termination deliberately fails
closed; inspect its recorded PID and owner before removing that lock file.

When local Prod needs the machine's HTTP proxy for Google OAuth, configure the
ignored `.env.local` before launching. With the local proxy listening on 7890:

```dotenv
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
NO_PROXY=localhost,127.0.0.1,::1,zhe.dev.hexly.ai
NODE_USE_ENV_PROXY=1
```

Use a Node version supporting `--use-env-proxy` (`node --help`). Bun loads these
values before spawning Node; Node's native fetch needs `NODE_USE_ENV_PROXY` to
honor proxy variables. Restart the launcher after changing them. Keep machine
proxy addresses out of hosted configuration. Verify a complete Google callback
and authenticated dashboard: reaching Google's login page proves only the first
OAuth request. An `ECONNRESET` during discovery or token exchange can surface as
Auth.js's generic configuration error even when credentials are configured.

Automated entry points sanitize inherited credentials and mask dotenv keys,
allocate a local Worker port, select E2E before startup, and produce a separate
Next build and TypeScript configuration per run. L2 defaults to 17006, L3 to
27006; set `ZHE_TEST_APP_PORT` for an additional concurrent run. Conflicting
browser mutations run serially. Run evidence lives in `.artifacts/e2e/<uuid>`;
L2 failure storage is retained for inspection. E2E never selects Production.

## Routing and identity

Interactive startup precedence is explicit mode, valid `zhe:environment-mode`
localStorage preference, then Demo. Automated launch intent overrides every
choice and neither reads nor writes that preference. The `Demo | E2E | Prod`
control has an accessible name without an additional visible label. Cloud CI
and hosted launches do not render it. Manual E2E is never locked by its mode.

Each child process has immutable resource bindings. Browser fetches carry the
instance ID captured when the document loaded. Mutations without that ID and
requests with an expired ID are rejected. Switching does not retarget pending
requests. Interactive sessions use an instance-specific cookie name. A switch
checks draft state, saves only an accepted mode, and reloads `/`; cancellation
leaves the document, preference and storage intact. A different tab's preference
change does not switch a running instance.

Local identities use the ordinary Auth.js Credentials provider and session
issuance. Launcher-generated credentials are verified, the user is read from
D1, and the ordinary allowlist callback runs. Production has only its real
provider; no mode flag bypasses business authorization. Local Prod starts the
same frontend against the real, server-configured D1 proxy and real Google
identity. It has not been exercised with live credentials in this task.

## Native resources and providers

`test-stack.ts` generates configuration inside owned storage, applies the same
SQL migration files, and runs `wrangler dev --local`. Migration 0036 records
the former script-only `analytics.source` fixup. Before a future authorized
production migration, inspect the existing column and migration ledger: a
production database previously changed by hand must record that existing change
rather than blindly adding the column twice. No production migration ran here. The local resource wrapper
imports the unchanged production Worker for business/D1 routes and supplies
native R2 and KV provider boundaries. It does not implement application CRUD.
The old filesystem R2 implementation and HTTP shim were removed.

Startup rejects differences in compatibility date/flags. The reviewed production/local compatibility date is `2025-01-01`, with no
compatibility flags. Both execute the same edge rate-limit and static forwarding
code. Intentional binding differences are local D1/KV IDs, a local R2 binding,
loopback origin and fixture secrets. R2's local HTTP transport uses expiring,
key/content-type-bound HMAC upload URLs rather than cloud S3 SigV4. It preserves
native object storage, MIME, streaming lengths, ranges and deletion; cloud S3
signing itself remains covered separately by the existing client tests.

`instrumentation.ts` installs external provider responses only when the local
launcher supplies a fixture capability and Demo/E2E mode. AI responses go through
the actual SDK, request construction, parser, authorization and persistence.
Unknown external fetch targets return a visible 503, never a production fallback.
The capture test supplies an owned SVG at the exact external favicon boundary.
The old Xray action-level hardcoded tweet fallback and its UI flag are removed;
unconfigured Xray returns a configuration error. Synthetic tweet/bookmark
responses now live exclusively at the local external-provider boundary.
Business API response interceptors for AI, search and uploads were removed;
transport-delay tests still forward real requests.

## Catalog and evidence

`fixtures-catalog.ts` owns catalog version and UTC time anchor. Identity, prose,
repository/post data and SVG artwork are synthetic and authored for this task.
The Markdown document and SVG are stored through native R2 and referenced by
normal upload records. No production export was used. Demo media URLs survive
restarts; E2E media URLs identify their disposable instance. API-key timestamps
use seconds; ordinary records use milliseconds, matching the real mappers.

Dataset selection is independent of mode. The capture project seeds the rich
catalog into disposable E2E storage, records revision/version/viewport/locale/
time anchor, checks loaded images and captures every listed route. Screenshot
creation is not equivalent to completing every action on that page.

| Feature / route | Prepared fixture or scenario | Action evidence | Visual evidence |
| --- | --- | --- | --- |
| Login / shell | Synthetic owner; other owner; normal Auth.js login | Auth setup, auth-guard, environment tests | Local Chrome through Caddy |
| Links / detail / redirects | Readable descriptions, covers, hidden and expired links, empty folder | HTTP links CRUD, ownership and redirect tests; browser link workflows | Capture `links` |
| Search / filters / bulk actions | Matching labels, distinct sources, empty results | Existing search API/browser and bulk tests; error handling in unit tests | Search browser captures; list capture |
| Ideas / editor | Markdown, image, checklist, table, tags | Existing ideas CRUD/browser tests; manual draft cancellation | Capture `ideas` |
| Todos | Parent/child, complete/open, due/overdue, emoji, tags | Existing todo workflows | Capture `todos` |
| X bookmarks / media | Published image, pending and failed capture | Connector real HTTP, digest/ownership, 100 MB video, Range and cleanup | Capture `x` |
| GitHub / README | Synthetic repo, topics, metrics, license, README | Existing GitHub/enrichment browser tests | Capture `github` |
| Webpage previews | Owned covers; focused capture success/failure scenarios | Existing screenshot/connector tests | Links and enrichment captures |
| Folders / tags | Three categories, empty category, three colored labels | Existing folders/tags CRUD tests | Capture `tags` |
| Overview / charts | Seven-day analytics with matching click totals | Existing overview and analytics tests | Capture `overview` |
| Uploads / storage | Owned SVG and Markdown; matching sizes and metadata | Native real HTTP and upload browser workflows | Captures `uploads`, `storage` |
| API keys / permissions / audit | Read-only and revoked keys, separate owner | Existing scoped API tests and API-key browser workflows | Capture `api-keys` |
| Webhook / rate limits | Local-only webhook token and rate | Existing webhook and rate-limit HTTP tests | Capture `webhook` |
| Backy / export / import | Empty integration configuration; local success/error boundary | Existing Backy and data-management workflows | Captures `backy`, `data-management` |
| Xray | Synthetic provider tweet/bookmarks, unconfigured and failure scenarios | Real fetch/parse/configuration and bookmark import; no live provider certification | Capture `xray` |
| AI configuration / organization | Fixture provider, structured success and 503 failure | Actual SDK/provider boundary and browser apply workflow | Capture `settings-ai`; AI dialog captures |
| Themes / density / responsive UI | Shared Basalt control, unchanged product surfaces | Existing browser layouts and theme tests | Local Chrome and focused responsive captures |

Prepared scenarios, executed test results and reviewed images are reported
separately in the repository management record. Proposed Douyin/Instagram
features in document 32 are not implemented product features and are not seeded.
Production OAuth/MFA, real provider availability, cloud edge delivery and
production data operations are outside this implementation's verification.

## Verification on 2026-09-28

The normal commit hook passed 3,483 unit/component tests, 197 in-process
integration tests, types, full staged-tree lint and secret scanning. Scoped
coverage: statements 98.08%, branches 95.15%, functions 96.62%, lines 98.82%.
The pre-existing untracked research file is outside this index evidence.

- Full Chromium: 214 passed, followed by 12 setup/Xray checks after replacing
  its business mock. Real provider success/failure and bookmark import passed.
- Concurrent L2 on `ZHE_TEST_APP_PORT=17106` and `17206`: both 222 passed with
  distinct native resources/builds. A subsequent 222-test run passed with
  normal Auth.js CSRF/callback session issuance.
- `ZHE_TEST_APP_PORT=27106 bun run test:e2e:pw --project=iphone`: 12 passed.
- `CI=1 bun run test:e2e:pw --project=chromium tests/playwright/environment.spec.ts`:
  3 passed locally. This verifies the CI flag behavior, not a hosted CI run.
- Worker: 80 tests and `bun x tsc --noEmit` passed. CLI source was unchanged;
  complete CLI process journeys are not certified here.

For interactive built-bundle verification, start `bun run dev --build --mode e2e`,
then run `ZHE_EXPECT_INITIAL=e2e ZHE_INITIAL_PREFERENCE=demo bun run scripts/verify-local-switching.ts`.
For remembered E2E, restart with `bun run dev`, then run
`ZHE_EXPECT_INITIAL=e2e ZHE_INITIAL_PREFERENCE=e2e bun run scripts/verify-local-switching.ts`.
Both passed through Chrome/Caddy: enabled manual E2E, accepted preferences,
Demo edit persistence across instance restarts, draft cancellation, native file
upload, owned cleanup, fresh reentry and expired-tab 410. The script restores its
Demo edit. Light/dark 390px X screenshots were reviewed. Local `--build` uses
the repository's `next start` convention, which emits Next's standalone-output
advisory; this task did not certify a hosted standalone deployment.

Captures use `ZHE_DATASET=demo bun run test:e2e:pw --project=capture` with catalog
v5, 1440×1000, zh-CN, Asia/Shanghai and the catalog time anchor. The browser clock
advances to let real chart animations complete. The gallery contains 15 routes;
contact-sheet inspection and focused full-size review are distinct from the
business-action assertions in the matrix. Exact run IDs and reviewed artifacts
are in the shared task's Zhe record. Screenshots do not prove every offscreen
state or live external integration. YAML syntax parsed locally; actionlint was
not installed. No hosted CI, push, release, deployment or production write ran.
