# Zhe

Short links, bookmarks, ideas, tasks and personal integrations, with a web app, edge Worker and CLI.
Profile: `ts-worker-web` with a `cli-library` lane.
Human overview: [README.md](README.md). Direction: [architecture](docs/01-architecture.md), [maintainer operations](docs/29-maintainer-operations.md). Frameworks must preserve this handbook. Maintain this root `AGENTS.md` as the only project handbook; do not create a `CLAUDE.md` alias, copy or import.

## Sources of Truth

This file is the contract; hooks, CI and config are enforcement. Raise weaker enforcement instead of lowering the contract.

| Fact | Where |
|---|---|
| Human docs / design | [README.md](README.md), [docs index](docs/README.md), [design tokens](docs/22-design-tokens.md) |
| Version | Root `package.json`; `lib/version.ts` exports `APP_VERSION`; CLI version synchronizes only on release |
| Enforcement | `.husky/`, `.github/workflows/ci.yml`, root/CLI/Worker Vitest configs |
| Env | Ignored `.env.local`; variable names and production setup in [deployment](docs/06-deployment.md) |
| Machine rules / accidents | Global `AGENTS.md` and `rules/`; [Retrospective.md](Retrospective.md) |

## Project Invariants

- Preserve authentication, tenant ownership and server-only credentials across Next.js, Worker and CLI boundaries. No production auth bypass or client-controlled ownership.
- `zhe-edge` proxies `zhe.to` to the Railway origin, resolves KV short links and authenticates analytics/cleanup calls. Keep reserved paths synchronized in `lib/constants.ts` and `worker/src/index.ts`.
- Set cache invalidation/dirty state at D1 mutation sites. Apply schema migrations before dependent release; mirror exceptional schema fixups into a real migration and the local test stack.
- Use Google Chrome through Caddy at `https://zhe.dev.hexly.ai` for manual previews, including `/dashboard/x`; verify HTTPS first. Keep the user's dev server running. Automated tests use dedicated loopback ports.
- Reuse Basalt density/radius/surface controls from [design tokens](docs/22-design-tokens.md): toolbar `sm` 32px, form `default` 36px or `lg` 40px; no invented xs/icon-sm or raw checkbox. Dialogs and their nested controls use the top bright theme surface, with 18px headings, 14px body and 12px field labels. Primitive changes update contract tests and docs together.
- Preserve card elevation/ring tokens and border-only nested media, menu wrappers and same-row density; keep business logic in ViewModels/models and routes thin. Detailed UI rules remain in [maintainer notes](docs/29-maintainer-operations.md).
- Store only bare SemVer in root `package.json`, display `v` prefix and import `APP_VERSION`; no hardcoded runtime/test versions. Synchronize `cli/package.json` when publishing `@nocoo/zhe`, not during routine docs edits.

## Stack / Layout

| Component | Choice / location |
|---|---|
| Web | Next.js/React, TypeScript 7, Tailwind/Basalt; `app/`, `components/`, `viewmodels/`, `models/` |
| Data | `lib/`, `actions/`, `drizzle/migrations/`; D1 proxy, KV and R2 |
| Edge | `worker/`; independent package, Wrangler config and Vitest suite |
| CLI | `cli/`; Node ≥22.16, TypeScript + Python Eagle helper, separate build/lockfile |

## Commands

Run from root with Bun (CI 1.3.11), Node, Python 3, gitleaks, osv-scanner and Wrangler on PATH. Install each lane with its frozen lockfile.

```bash
bun install --frozen-lockfile
(cd worker && bun install --frozen-lockfile)
(cd cli && bun install --frozen-lockfile)
bun run typecheck
bun run lint
bun run build
bun run test:unit:coverage
bun run test:integration
bun run test:api
bunx playwright install chromium webkit
bun run test:e2e:pw
(cd worker && bun run test)
(cd worker && bun x tsc --noEmit)
(cd cli && bun run build && bun run lint && bun run test:coverage)
```

L1 coverage deliberately uses `--pool=forks` to avoid VM-thread V8 miscounting. In-process integration tests are L1; `test:api` is real HTTP L2.
The test runners own local env overrides, migrations, readiness and cleanup; no Cloudflare token or remote `D1_TEST_*`/`R2_TEST_*`/`KV_TEST_*` values are required.

## Verification

6DQ = L1/L2/L3 + G2 + D1 isolation; the former G1 dimension was merged into L1 on 2026-09-21, per lane. Status: `enforced`, `planned`, `manual`, `N/A`; no skipped/focused tests.

| Piece | Required proof and current reality | Status | Evidence / gap |
|---|---|---|---|
| L1 web (incl. former G1 web static) | Statements/branches/functions/lines each ≥95%; strict types and lint/format with zero errors/warnings; current coverage config is 95/85/90/95 respectively | planned | Achieved static subchecks run today (pre-commit types/full Biome; CI quality) via `vitest.config.ts`; hooks/CI enforce the weaker scoped coverage values, not this contract, the hook checks an exported index snapshot and blocks failed stages; its <30s budget and independent rejection proof remain unverified |
| L1 CLI / Worker (incl. former G1 CLI/Worker static) | Four metrics each ≥95% in both lanes, including Python helper behavior; all executable lanes have strict types/lint and zero warnings | planned | CLI branches 90 with command exclusions; Python unittest runs without coverage; Worker has no coverage threshold. CLI CI runs types/Biome but lacks warning-as-error; Worker CI currently runs tests only |
| L2 | Real HTTP for every endpoint/method, SQL and tenant behavior | planned | `test:api` enforced by pre-push/CI; completeness of endpoint/method inventory still needs a gate |
| L3 | Real browser journeys and isolated CLI process workflows | planned | Browser suite runs in CI/release preflight; CLI command workflow coverage is incomplete |
| G2 | Required dependency + secret scanners across all lockfiles and pushed commits | planned | Root staged gitleaks + root OSV and CI exist; CLI/Worker lockfile and push-ref coverage remain gaps |
| D1 | Per-run local persistence; guards/marker before fixtures and cleanup | planned | Local stack and marker checks exist, but fixed `.test-storage` is deleted before marker validation and shared between lanes |
| Build | Web and CLI bundles | enforced | CI builds both; `typecheck` is not a build |
| Docs | Current tests, design contracts and migrations documented | manual | [Testing](docs/05-testing.md), full diff review |

Pre-commit exports the index with `git checkout-index`, verifies installed manifests match, generates route types and sequentially runs coverage, in-process integration, types and full lint in that snapshot, then staged gitleaks; failures cancel the owned child and clean the snapshot. Target: unified L1 (types, check-only lint, coverage) on an index snapshot, <30s.
Pre-push runs local L2 and root OSV in parallel; it does not use stdin push refs for secret scanning. Target: L2/G2 over exact pushed refs, <3min.
Hooks are check-only; never use `--no-verify`, disable gates or run autofix as a gate.

## Resources / Isolation

Dev: 7006 behind Caddy with `.next/dev`. L2: 17006; L3: 27006; test Next output: `.next/test`. Keep daily dev alive and serialize L2/L3 until their shared paths are per-run. Finish production builds before L2/L3: `next build` cleans the parent `.next` directory, including `.next/test`, and restarts a running test server.
`scripts/test-stack.ts` owns local Worker 8788 by default (`ZHE_TEST_WORKER_PORT` can select an isolated port, e.g. 28788) and R2 HTTP shim 18788, SQLite/KV under `.test-storage/wrangler` and filesystem R2 under `.test-storage/r2`.
The shim is test-only. Use local Wrangler/Miniflare, fresh per-run directories, loopback/test guards and `_test_marker`; never deploy remote `-test` resources or use production/daily-dev data for E2E.

## Operations / Release

Only a requested release runs `bun run release`: patch by default, L3 preflight, version/lock/changelog, normal commit/push/tag/release, Railway redeploy and `/api/live` polling. Details: [runbook](docs/29-maintainer-operations.md).
Worker/schema changes need their corresponding deployment/migration under that release authorization; routine documentation changes do not bump versions.

## Retrospective

Narratives: [Retrospective.md](Retrospective.md); cross-project lessons: global rules/nmem; deterministic rules: hooks/tests.
- Cache invalidation belongs at the D1 mutation source; test new columns through write/read, including real migrations.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
