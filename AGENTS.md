# Zhe

Short links, bookmarks, ideas, tasks, and personal integrations across a Next.js web app, Cloudflare edge Worker, and Node/Python CLI (`@nocoo/zhe`).
Docs: [README.md](README.md) · [Docs Index](docs/README.md) · [Architecture](docs/01-architecture.md) · [Design Tokens](docs/22-design-tokens.md) · [Operations](docs/29-maintainer-operations.md) · [Local Envs](docs/33-local-environments.md) · [jp4 Topology](docs/34-jp4-migration.md) · [Retrospective](Retrospective.md)

## Layout

| Surface | Stack & Paths                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Web     | Next.js/React, TypeScript 7 (`@typescript/native-preview`), Tailwind/Basalt 3; `app/`, `components/`, `viewmodels/`, `models/` |
| Data    | `lib/`, `actions/`, `drizzle/migrations/`; D1 Worker proxy, KV, and R2                                                         |
| Edge    | `worker/` (`zhe-edge`); standalone package, Wrangler config, and Vitest suite                                                  |
| CLI     | `cli/` (`@nocoo/zhe`); Node >=26.12.1, TypeScript + Python Eagle helper, separate build/lockfile                               |

## Commands

Run from root with Bun (CI 1.3.11), Node (CI 26.13.1), Python 3, `gitleaks`, `osv-scanner`, and `worker/`'s locked Wrangler on PATH. Env names live in `.env.example` (local overrides in ignored `.env.local`; prod in [deployment](docs/06-deployment.md)).

```sh
bun install --frozen-lockfile
(cd worker && bun install --frozen-lockfile)
(cd cli && bun install --frozen-lockfile)
bun run dev                       # https://zhe.dev.hexly.ai -> 127.0.0.1:7006 (Demo default; --mode demo|e2e|prod, --build)
bun run demo:reset                # resets owned, stopped Demo storage only
bun run typecheck                 # S1 (regenerates .next/types if stale, then tsc --noEmit)
bun run lint                      # S2 check-only Biome, 0 warnings
bun run build                     # B1 Next.js production bundle
bun run test:unit:coverage        # L1 web unit coverage (>=80%; --pool=forks avoids VM-thread V8 miscounting)
bun run test:integration          # L3 in-process integration tests
bun run test:api                  # L3 real HTTP API suite against isolated local Wrangler D1/KV/R2
bunx playwright install chromium
bun run test:e2e:pw               # L4 Playwright Chromium journeys on isolated local stack
(cd worker && bun run lint && bun run test:coverage)
(cd cli && bun run build && bun run lint && bun run test:coverage)
```

Test runners own local env overrides, migrations, readiness, and cleanup; no Cloudflare token or remote `D1_TEST_*` / `R2_TEST_*` / `KV_TEST_*` values are required.

## Invariants

- Preserve authentication, tenant ownership, and server-only credentials across Next.js, Worker, and CLI boundaries; never bypass production auth or allow client-controlled ownership.
- `zhe-edge` proxies `zhe.to` to `origin.zhe.to` (Caddy -> `zhe-app` on jp4), resolves KV redirects, and authenticates analytics/cleanup; sync `RESERVED_PATHS` in `lib/constants.ts` and `worker/src/index.ts`.
- Set cache invalidation/dirty flags at D1 mutation sites and test new columns with real migrations; apply schema migrations before dependent releases and mirror fixups into migrations and the test stack.
- Keep routes thin and logic in `viewmodels/`/`models/`; preserve `LayerCard` surfaces, non-hover descriptor actions, equal-height grid/GitHub cards, and X masonry ([design tokens](docs/22-design-tokens.md)).
- Reuse Basalt 3 primitives (`sm` 28px / `default` 34px / `lg` 40px, `PageHeader`, bright dialogs; no `xs`/`icon-sm` or raw checkbox) and update contract tests with [design tokens](docs/22-design-tokens.md).
- Store bare SemVer only in root `package.json`, display `v` prefix, and import `APP_VERSION` (no hardcoded versions); sync `cli/package.json` only when releasing `@nocoo/zhe`, never on routine docs edits.
- Manual previews use Chrome via Caddy at `https://zhe.dev.hexly.ai` (verify HTTPS first, incl. `/dashboard/x`); keep the user's dev server running, and run automated tests on isolated loopback ports.
- Releases require approval via `bun run release` (patch default, Playwright preflight, Worker/schema parity); CD runs via `.github/workflows/pipeline.yml` (`D1`–`D5` Docker deploy on `main` push or `workflow_dispatch` with `deploy=true`) to jp4, and tags are not deploy proof ([runbook](docs/29-maintainer-operations.md)).
- Preserve `origin.zhe.to` (Worker forwarding, lookup, analytics, cron). Never alter DNS, TLS, or shared Caddy without approval; validate and hot-reload Caddy, never restart ([jp4 topology](docs/34-jp4-migration.md)).

## Quality & Local Gates

Follows `system1-quality`; CI slot definitions and pinned `base-ci` revision live in `.github/workflows/quality-slots.yml` (`quality / Z1: Gate` required on `main` and invoked alongside `D1`–`D5` Docker CD via `.github/workflows/pipeline.yml`). Raise weaker enforcement rather than lowering this contract. Status vocabulary: `enforced`, `planned`, `manual`, `N/A`; no skipped or focused tests.

- **Coverage**: L1 enforces >=80% statements/branches/functions/lines across web (excluding `components/**`, `views/**`, `pages/**`, and page/layout/error shells covered by L4 E2E; `allowOnly: false`, `passWithNoTests: false`), CLI (incl. Python helper), and Worker; Worker excludes `src/local-resources.ts`, CLI excludes `src/index.ts` and `src/commands/**`.
- **Exceptions**: `L2 Runtime` is `N/A` in CI (covered by `L3: Integration` running `test:integration` and `test:api`); `P1 Package` verifies the Linux standalone container image (`zhe-container-smoke`) in CI (`@nocoo/zhe` consumer check is `planned`).
- **Gaps / manual**: `L2` endpoint inventory, `L4` CLI workflows, and `G2` CLI/Worker lockfile + push-ref scans are `planned`; docs/migration review is `manual` ([testing](docs/05-testing.md)).
- **Local pre-commit**: installed via `bun run prepare` (`.husky/`); checks index snapshot via `git checkout-index`, verifies lockfiles, runs `next typegen`, parallel web/cli/worker `S1/S2/L1`, then staged `gitleaks`.
- **Local pre-push**: runs `bun run test:api` and root `osv-scanner` in parallel. Hooks are check-only; never use `--no-verify`, disable gates, or autofix as a gate.

## Resources & Isolation

| Lane  | Endpoint / State                                                                                                                   | Boundary                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Dev   | `https://zhe.dev.hexly.ai` -> `127.0.0.1:7006`, `.next-local`, `.demo-storage`                                                     | Daily local UI (Demo default); `demo:reset` only on owned stopped storage; preserve running server                          |
| Tests | L2 `127.0.0.1:17006`, L4 `127.0.0.1:27006` (`ZHE_TEST_APP_PORT`), `.next-test/<uuid>`, `.test-storage/runs/<uuid>`                 | Native Wrangler D1/KV/R2 + prod migrations, allocated Worker port, `.artifacts/e2e/<uuid>`; historical `.test-storage` kept |
| Prod  | `https://zhe.to` -> `zhe-edge` -> `origin.zhe.to` -> Caddy -> `zhe-app` (`/data/zhe` on jp4, `127.0.0.1:17006` -> `7005`, `.next`) | Read-only checks unless deployment is authorized; secrets in `/data/zhe/.env.runtime`                                       |

- Automation locks by launch intent (never `mode === "e2e"`), strips prod credentials, and ignores interactive preferences; never target Production ([local envs](docs/33-local-environments.md)).
- Browser mutations share an owned run; disjoint Playwright specs run in parallel (`workers: 3` in CI); do not run competing builds during motion tests.

## Retrospective

Record incident narratives in [Retrospective.md](Retrospective.md); promote recurring project constraints to `Invariants` above and enforceable safeguards to tests/hooks.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
