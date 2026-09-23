# 29 — 维护、发布与界面约束

[CLAUDE.md](../CLAUDE.md) 是当前质量契约；本文保留版本、边缘 Worker 和界面的详细约束。下列源码路径均相对仓库根目录。发布必须有当前任务授权，文档修改不需要主动升版或发布。L2/L3 使用本地隔离栈，不能创建远端 test 资源。

## Versioning
本地测试的 Worker 默认使用 8788；与其他项目冲突时，可通过 `ZHE_TEST_WORKER_PORT=37006` 运行 L2、L3 或发布命令，测试服务器与 D1 代理会使用同一端口。日常开发和生产部署不受影响。

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
2. **L3 Playwright preflight (hard gate)** — runs `bun run test:e2e:pw` before bumping; aborts if any spec fails. Keep the L3 preflight enabled
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
| `worker/test/index.test.ts` | Unit tests covering all routing, redirect, analytics, cron paths |
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
bun run test      # vitest run
bun run dev       # wrangler dev (local testing)
bun run tail      # wrangler tail (live logs)
```

Custom domains: `https://zhe.to` and `https://zhe-edge.worker.hexly.ai`. The D1 proxy uses the latter. Both `workers.dev` and version preview URLs are disabled.
KV Namespace: `zhe` (ID in `worker/wrangler.toml`)

### Geo Header Mapping

The Worker maps Cloudflare geo headers to the Vercel-style headers the origin expects:

| Cloudflare Header | Mapped To | Used By |
|-------------------|-----------|---------|
| `CF-IPCountry` | `x-vercel-ip-country` | `extractClickMetadata()` in `lib/analytics.ts` |
| `request.cf.city` | `x-vercel-ip-city` | `extractClickMetadata()` in `lib/analytics.ts` |

## Design Tokens & UI Controls
Content cards use the shared `shadow-card` / `hover:shadow-card-hover` elevation tokens with a fine `ring-border/40` edge; nested previews and media frames use borders only. Light/dark values live in `app/globals.css`.

**权威全文**：[`docs/22-design-tokens.md`](22-design-tokens.md)
**CSS 定义**：`app/globals.css` · **原语**：`components/ui/*` · **契约测试**：`tests/unit/ui/control-density.test.tsx`

写 Dashboard UI 时 **必须复用** 下列契约，**禁止** 在业务组件里重新发明控件高度 / 圆角 / checkbox。

### Radius ladder

| Class | Value | Use |
|-------|-------|-----|
| `rounded-island` | 20px | AppShell content panel |
| `rounded-card` | 14px | List cards, two-pane sections |
| **`rounded-widget`** | **10px** | **Button / Input / Select / icon triggers** |
| `rounded-full` | pill | Tag / Due / Badge chips **only** |

Do **not** put `rounded-lg` / `rounded-sm` / arbitrary `rounded-[Npx]` on controls.

### Control density (Basalt sizes)

| Tier | Height | Type | Button | Input / Select / Checkbox | Use |
|------|--------|------|--------|---------------------------|-----|
| lg | 40px (`h-10`) | `text-sm` | `lg` | `lg` | Forms / modals primary |
| default | 36px (`h-9`) | `text-sm` | `default` | `default` | Settings, API Keys, Backy, config forms |
| **toolbar compact** | **32px (`h-8`)** | **`text-xs`** | **`sm`** | **`sm`** | Toolbars, filter bars, panel inline fields |

```tsx
// ✅ form / settings secondary actions
<Button size="default">保存</Button>

// ✅ toolbar / filter / panel inline
<Button size="sm">新建待办</Button>
<Input size="sm" />
<SelectTrigger size="sm" />
<Checkbox size="sm" />
<Button size="icon" aria-label="menu" />
```

Do **not** invent `xs` / `icon-sm`. Compact is Basalt **`sm`**.

Dropdown and context menu items use the local `components/ui` wrappers: 36px minimum height, 8px icon-to-label gap, and 16px icons with 1.5px strokes. Do not add per-icon sizes or margins inside menu items. Card metadata icons use 14px with the same stroke width.

### Hard rules for agents

1. **PageHeader actions / filter bars** → Button `size="sm"` (or `icon`); fields `size="sm"`.
2. **Settings / form pages** → Button `size="default"` (h-9) or `lg` (h-10); not toolbar `sm` unless the control is in a true toolbar row.
3. **Same row → same height**; use `items-center`. Prefer one density per toolbar.
4. **Checkbox** always from `@/components/ui/checkbox` — never raw HTML checkbox.
5. **Inline “text-looking” editors** still use `Input size="sm"` + surface overrides (`border-transparent` etc.), not a bare `<input>` with a custom focus ring.
6. **Changing primitive defaults** requires updating `tests/unit/ui/control-density.test.tsx` and `docs/22-design-tokens.md` in the same change set (separate atomic commits OK: code then docs).
7. **Reference implementations**: `todos-filter-bar.tsx`, `todo-detail-pane.tsx`, `todo-tree-row.tsx`.

### Surface hierarchy (L0–L3)

| Layer | Token | Role |
|-------|-------|------|
| L0 | `bg-background` | Page / sidebar chrome |
| L1 | `bg-card` | AppShell content panel |
| L2 | `bg-secondary` | Embedded cards / list panes |
| L3 | `bg-secondary` + `border` + `shadow-xs` | Editable controls |

`--card` is the L1 **panel** surface (shadcn name kept); `<Card>` intentionally uses L2 `bg-secondary`.
