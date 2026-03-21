# 质量体系升级：从「四层测试」到「三层测试 + 两道门控」

本文档设计 zhe 项目从旧版「四层测试架构」升级到新版「质量体系（L1+L2+L3+G1+G2）」的具体实施步骤。

> 返回 [README](../README.md) | 参考 [测试策略](05-testing.md) | [旧版四层测试计划](11-four-layer-test-plan.md)

---

## 一、新旧体系对比

### 旧版：四层测试架构

| 层级 | 名称 | Hook | 当前状态 |
|------|------|------|----------|
| L1 | Unit Test | pre-commit | ✅ 2030 用例，90% 覆盖率 |
| L2 | Lint | pre-commit | ✅ ESLint `--max-warnings=0` |
| L3 | API E2E | pre-push | ✅ 235 用例（in-process import handler） |
| L4 | BDD E2E | on-demand | ✅ 108 用例，Playwright |

### 新版：三层测试 + 两道门控

| 层级 | 名称 | 验证对象 | Hook |
|------|------|----------|------|
| **L1** | Unit/Component | 纯函数、ViewModel、Hooks | pre-commit (<30s) |
| **L2** | Integration/API | **真 HTTP 请求**、跨模块协作 | pre-push (<3min) |
| **L3** | System/E2E | 真实用户端到端流程 | CI / on-demand |
| **G1** | Static Analysis | 类型检查 + Lint strict | pre-commit (与 L1 并行) |
| **G2** | Security/Perf | 依赖漏洞 + Secrets 泄露 | pre-commit + pre-push |

---

## 二、Gap 分析

| # | 差距 | 影响 |
|---|------|------|
| 1 | **G1: `tsc --noEmit` 存在 19 个 type errors** — `tsc --noEmit` 当前就会失败：`.next/types/` broken import（2）、测试文件类型错误（17：`null as NextMiddleware`、`AdapterAccount` 类型不匹配、`ExportedLink` optional 字段）。必须先修完才能加 hook | 不能直接加 hook，否则 brick 所有 commit |
| 2 | **G1: ESLint 非 strict 配置** — 使用 `next/core-web-vitals + next/typescript`，未启用 `@typescript-eslint/strict`；`no-unused-vars` 是 warn 而非 error；缺少 `no-explicit-any: error` | 宽松规则放行低质量代码 |
| 3 | **L2: `tests/api/` 混合了两类测试** — 该目录包含 9 个 route handler 测试（通过 `await import('@/app/api/.../route')` 调用 GET/POST）和 5 个 server action 测试（通过 `await import('@/actions/...')` 调用）。全部依赖 in-process `vi.mock` 和 D1 内存模拟器。迁移真 HTTP 前必须先拆分 | 无法笼统 "全部迁移"，需要分类处理 |
| 4 | **G2: 无安全扫描** — 无 osv-scanner、gitleaks | 依赖漏洞和 secrets 泄露无门控 |
| 5 | **文档/Hook 重组** — 层级命名、hook 内容需与新体系对齐 | 文档过时 |

### 当前 `tests/api/` 文件分类

**Route Handler 测试**（可迁移为真 HTTP）：

| 文件 | 端点 | 调用方式 | vi.mock |
|------|------|----------|---------|
| `api.test.ts` | `/api/health`, `/api/lookup`, `/api/record-click` | `import route → GET/POST(request)` | 无 |
| `api-extra.test.ts` | `/api/lookup`, `/api/record-click` | `import route → GET/POST(request)` | 1 |
| `live.test.ts` | `/api/live` | `import route → GET()` | 无 |
| `worker-status.test.ts` | `/api/worker-status` | `import route → GET()` | 1 |
| `sync-kv.test.ts` | `/api/cron/sync-kv` | `import route → POST(request)` | 2 |
| `cleanup.test.ts` | `/api/cron/cleanup` | `import route → POST(request)` | 1 |
| `webhook.test.ts` | `/api/link/create/[token]` | `import route → HEAD/GET/POST` | 无 |
| `tmp-upload.test.ts` | `/api/tmp/upload/[token]` | `import route → HEAD/GET/POST` | 1 (R2) |

**Server Action 测试**（保持 in-process import，不迁移 HTTP）：

| 文件 | Actions | 调用方式 | vi.mock |
|------|---------|----------|---------|
| `edit-link.test.ts` | `actions/links` (create/update/updateNote) | `import action → call()` | 1 |
| `folders.test.ts` | `actions/folders` (CRUD) | `import action → call()` | 1 |
| `settings.test.ts` | `actions/settings` (export/import) | `import action → call()` | 1 |
| `upload.test.ts` | `actions/upload` (presigned URL, CRUD) | `import action → call()` | 2 (R2, S3) |
| `backy.test.ts` | `actions/backy` (config, entries) | `import action → call()` | 1 |
| `xray.test.ts` | `actions/xray` (config, entries) | `import action → call()` | 2 |

---

## 三、实施步骤与原子化提交

### Step 1: G1 — 修复现有 type errors + 添加 `tsc --noEmit` 到 pre-commit

**前置问题**：`bun x tsc --noEmit` 当前输出 19 个 errors：

| 文件 | 错误类型 | 数量 | 修复方案 |
|------|----------|------|----------|
| `.next/types/app/api/webhook/[token]/route.ts` | TS2307 broken import | 2 | `tsconfig.json` 的 `exclude` 添加 `.next/types` |
| `tests/unit/backy-actions.test.ts` | `null` not assignable to `NextMiddleware` | 8 | `null as unknown as NextMiddleware` 或 `undefined!` |
| `tests/unit/webhook-actions.test.ts` | 同上 | 4 | 同上 |
| `tests/unit/middleware.test.ts` | 同上 | 1 | 同上 |
| `tests/unit/auth-adapter.test.ts` | `AdapterAccount` 类型不匹配 | 3 | 添加 `satisfies` 或修正 mock 数据类型 |
| `tests/unit/settings-actions.test.ts` | `ExportedLink` optional 字段 | 1 | 将 `folderId?: string \| null \| undefined` 对齐为 `string \| null` |

**改动文件**：
- `tsconfig.json` — exclude `.next/types`（或 `.next`）
- `tests/unit/backy-actions.test.ts` — 修复 13 处 `null as NextMiddleware`
- `tests/unit/webhook-actions.test.ts` — 修复 4 处
- `tests/unit/middleware.test.ts` — 修复 1 处
- `tests/unit/auth-adapter.test.ts` — 修复 3 处类型
- `tests/unit/settings-actions.test.ts` — 修复 1 处类型
- `package.json` — 新增 `"typecheck": "tsc --noEmit"` script
- `.husky/pre-commit` — 添加 `bun run typecheck`

**原子化提交**：

| # | Commit | 内容 |
|---|--------|------|
| 1.1 | `fix: exclude .next/types from tsc to avoid broken generated imports` | `tsconfig.json` |
| 1.2 | `fix: resolve NextMiddleware null type errors in test files` | 5 个测试文件 |
| 1.3 | `fix: resolve AdapterAccount and ExportedLink type mismatches in tests` | 2 个测试文件 |
| 1.4 | `chore: add typecheck script and pre-commit hook` | `package.json` + `.husky/pre-commit` |

**验证**：`bun run typecheck` 输出 0 errors 后才可执行 1.4。

---

### Step 2: G1 — ESLint 升级为 strict 配置

**改动文件**：
- `package.json` — 新增 dev dependency `typescript-eslint`
- `eslint.config.mjs` — 引入 `tseslint.configs.strict`，升级规则
- 全部源码中被新规则捕获的 lint error — 逐一修复

**规则升级清单**：

| 规则 | 旧值 | 新值 |
|------|------|------|
| `@typescript-eslint/no-unused-vars` | `warn` | `error` |
| `@typescript-eslint/no-explicit-any` | (未设置) | `error` |
| `@typescript-eslint/no-non-null-assertion` | (未设置) | `error` (strict 自带) |
| `@typescript-eslint/no-unnecessary-condition` | (未设置) | `error` (strict 自带) |
| `@typescript-eslint/prefer-nullish-coalescing` | (未设置) | `error` (strict 自带) |

**原子化提交**：

| # | Commit | 内容 |
|---|--------|------|
| 2.1 | `chore: add typescript-eslint package` | `bun add -d typescript-eslint` |
| 2.2 | `refactor: upgrade eslint to strict typescript rules` | `eslint.config.mjs` 改为 strict 配置 |
| 2.3~N | `fix: resolve strict lint errors in <module>` | 按模块逐批修复 lint errors（每个 commit 对应一个模块或一类 error） |

**关键假设**：
- `next/core-web-vitals` 和 `tseslint.configs.strict` 可以共存（通过 flat config 合并）
- 如果 strict 规则与 Next.js 规则冲突，需要在 overrides 中关闭冲突项

**验证**：`bun run lint` 0 errors, 0 warnings。

---

### Step 3: G2 — 安装安全门控

**改动文件**：
- `.husky/pre-commit` — 追加 gitleaks（扫描暂存区，在 commit 前拦截 secrets）
- `.husky/pre-push` — 追加 osv-scanner（扫描 lockfile 依赖漏洞）
- `scripts/ensure-tools.sh` — 新建，hook 调用前先检查工具是否存在

**工具安装版本化**：

`brew install` 是手工约定，不同开发者机器上会漂移（有人有、有人没有、版本不同）。解决方案：

1. **Hook 中加 guard 脚本**：在 `.husky/pre-commit` 和 `.husky/pre-push` 调用安全扫描前，先检查工具是否可用。工具缺失时打印安装提示并 **skip**（warn 而非 fail），避免 brick 其他人的 commit 流程。

```bash
# scripts/ensure-tools.sh (sourced by hooks)
check_tool() {
  if ! command -v "$1" &>/dev/null; then
    echo "⚠️  $1 not found — skipping $2. Install: brew install $1"
    return 1
  fi
  return 0
}
```

2. **`docs/02-getting-started.md` 补充工具清单**：将 osv-scanner 和 gitleaks 加入开发环境 prerequisites，明确版本要求。

3. **CI 定义**：本项目当前无 CI pipeline（无 `.github/workflows`）。G2 目前定位为 **本地开发者 hook**，不在 CI 重复执行。如果未来加 CI，需要在 workflow YAML 中显式安装这两个工具（`brew install` 或 `go install`）。文档中标注此项为 TODO。

**原子化提交**：

| # | Commit | 内容 |
|---|--------|------|
| 3.1 | `feat: add ensure-tools.sh for graceful tool availability check` | `scripts/ensure-tools.sh` |
| 3.2 | `chore: add gitleaks to pre-commit and osv-scanner to pre-push` | `.husky/pre-commit` + `.husky/pre-push` 调用 guard + 工具 |
| 3.3 | `docs: add osv-scanner and gitleaks to dev prerequisites` | `docs/02-getting-started.md` |

**gitleaks hook 放置说明**：

`gitleaks protect --staged` 扫描的是当前暂存区内容。这意味着：
- **pre-commit（正确）**：暂存区就是即将 commit 的内容，`--staged` 精确匹配
- **pre-push（错误）**：push 时暂存区通常为空，secret 已经在 commit 里，`--staged` 扫不到

因此 gitleaks 必须放在 **pre-commit**，而非 pre-push。osv-scanner 扫描 lockfile 是静态文件，放 pre-push 即可。

**原子化提交**：

| # | Commit | 内容 |
|---|--------|------|
| 3.1 | `chore: add gitleaks to pre-commit and osv-scanner to pre-push` | `.husky/pre-commit` + `.husky/pre-push` |

**pre-commit 变为**：
```bash
# L1: Unit tests + coverage gate (≥90%)
bun run test:unit:coverage

# G1: Static analysis
bun run typecheck
bunx lint-staged

# G2: Secrets scanning (must be pre-commit, not pre-push)
source "$(dirname "$0")/../scripts/ensure-tools.sh"
if check_tool gitleaks "secrets scanning"; then
  gitleaks protect --staged --no-banner
fi
```

**pre-push 变为**：
```bash
# L2: Integration/API tests
bun run test:api

# G2: Dependency vulnerability scanning
source "$(dirname "$0")/../scripts/ensure-tools.sh"
if check_tool osv-scanner "dependency audit" && [ -f bun.lock ]; then
  osv-scanner --lockfile=bun.lock
fi
```

**验证**：
- `osv-scanner --lockfile=bun.lock` — 检查是否有已知漏洞（首次可能需要修复）
- `gitleaks protect --staged --no-banner` — 确认无 secrets 泄露

---

### Step 4: L2 — 拆分测试目录 + Route Handler 测试迁移为真 HTTP

#### Step 4a: 拆分 `tests/api/` 为两个独立目录

**问题**：当前 `tests/api/` 混合了 route handler 测试（9 个文件）和 server action 测试（5 个文件）。它们验证的对象不同，运行环境也将不同：
- Route handler 测试 → 迁移为真 HTTP，需要独立 server
- Server action 测试 → 保持 in-process import，不需要 server

**目录拆分方案**：

```
tests/
├── api/                    # (保留) Route handler 测试 → 将迁移为真 HTTP (L2)
│   ├── api.test.ts
│   ├── api-extra.test.ts
│   ├── live.test.ts
│   ├── worker-status.test.ts
│   ├── sync-kv.test.ts
│   ├── cleanup.test.ts
│   ├── webhook.test.ts
│   └── tmp-upload.test.ts
├── integration/            # (新建) Server action 测试 → 保持 in-process (L1)
│   ├── edit-link.test.ts
│   ├── folders.test.ts
│   ├── settings.test.ts
│   ├── upload.test.ts
│   ├── backy.test.ts
│   └── xray.test.ts
```

**归属变更**：
- Server action 测试从 L2 降级为 **L1**（它们本质是 in-process 集成测试，依赖 `vi.mock` + D1 内存模拟器，和单元测试的运行环境一致）
- `test:unit:coverage` 的 exclude 从 `tests/api/**` 不变
- 新增 `test:integration` script 运行 `tests/integration/`
- `test:api` 仅运行 `tests/api/`（route handler 测试）

**原子化提交**：

| # | Commit | 内容 |
|---|--------|------|
| 4a.1 | `refactor: move server action tests to tests/integration/` | `git mv` 6 个文件 |
| 4a.2 | `chore: add test:integration script, update test:unit exclude` | `package.json` scripts 调整 |
| 4a.3 | `chore: update pre-commit hook to include integration tests` | `.husky/pre-commit` 添加 `bun run test:integration` |

#### Step 4b: Route Handler 测试迁移为真 HTTP

> **性质说明**：这不是"改调用方式"，而是 **测试基础设施重构**。
> 现有 8 个 route handler 测试文件的运行环境与 L1 单元测试完全相同——
> 它们依赖 `tests/setup.ts` 的 D1 内存模拟器（全局 mock `executeD1Query`）、
> per-file `vi.mock` 拦截 auth/R2/KV 等外部依赖、以及断言 mock 调用次数的能力
> （如 `tmp-upload.test.ts` 中的 `expect(mockR2Put).toHaveBeenCalledWith(...)`）。
> 一旦请求从 Vitest 进程发往独立的 Next.js dev server，**所有这些 in-process mock 都不会存在于 server 进程中**。
> 因此，这一步的实质是：**为 API 集成测试构建一套不依赖 vi.mock 的独立测试环境**。

##### 测试环境策略

需要为独立 server 进程解决 5 个外部依赖的替代方案：

| 依赖 | In-process 现状 | 跨进程后的问题 | 目标方案 |
|------|-----------------|----------------|----------|
| **D1 数据库** | `tests/setup.ts` 全局 mock `executeD1Query` → Map/Array 内存模拟器 | Server 进程不加载 mock，查 D1 真库 | 复用 Playwright 的远程 D1 test DB（已有 `CF_D1_*` 环境变量体系） |
| **Auth** | `vi.mock('next-auth')` 返回固定 session `{ user: { id, email } }` | Server 进程中 auth middleware 正常运行 | `E2E_SKIP_AUTH=1` 环境变量绕开（与 Playwright 方案一致） |
| **R2/S3** | `vi.mock('@/lib/r2')` 返回 mock client，断言 `mockR2Put.toHaveBeenCalledWith(...)` | Server 进程中 R2 client 指向真实 bucket | 方案 A：miniflare 本地 R2 模拟器（推荐）；方案 B：独立 R2 test bucket；方案 C：Phase 5 暂缓，保留 in-process 版本 |
| **KV** | `vi.mock('@/lib/kv')` | Server 进程使用真实 KV namespace | 环境变量指向 test KV namespace |
| **Mock 断言** | `expect(mockFn).toHaveBeenCalledWith(...)` 验证内部行为 | 跨进程无法断言 server 内部函数调用 | 改为 **黑盒断言**：验证 HTTP response body/status/headers + 数据库副作用（通过 D1 HTTP API 查询） |

> **关键范式转换**：从白盒（断言 mock 调用）转为黑盒（断言 HTTP 响应 + 数据库副作用）。
> 这意味着测试不仅要改调用方式，**断言逻辑也需要全部重写**。

##### 现有 mock 依赖逐文件清单

| 文件 | vi.mock 目标 | mock 断言（跨进程失效） | 迁移难度 |
|------|-------------|------------------------|----------|
| `api.test.ts` | 无 | 无 | **低** — 纯 HTTP GET，只断言 response |
| `live.test.ts` | 无 | 无 | **低** — 纯 HTTP GET |
| `api-extra.test.ts` | `@/lib/db` (getLinkBySlug, recordClick) | `expect(recordClick).toHaveBeenCalledWith(...)` | **中** — 需改为查 D1 验证 click 记录 |
| `worker-status.test.ts` | `@/lib/cron-history` | `recordCronResult` 直接调用设置状态 | **中** — 需要 seed cron 历史数据到 server |
| `sync-kv.test.ts` | `@/lib/kv/client`, `@/lib/kv/dirty` | `expect(kvPut).toHaveBeenCalled()` | **中高** — 需要验证 KV 副作用 |
| `cleanup.test.ts` | `@/lib/r2` | `expect(r2Delete).toHaveBeenCalledWith(...)` | **高** — 需要 R2 替代方案 |
| `webhook.test.ts` | 无 | 无，但需要预置 webhook + folder 数据 | **中** — 需要 D1 seed |
| `tmp-upload.test.ts` | `@/lib/r2` (getSignedUrl, putObject, headObject) | `expect(mockR2Put).toHaveBeenCalledWith(...)`, `expect(mockGetSignedUrl)...` | **高** — R2 深度依赖，6 种 mock 断言 |

##### 分阶段迁移

| Phase | 文件 | 新增基础设施 | 门槛 |
|-------|------|-------------|------|
| **Phase 0** | (无测试迁移) | `scripts/run-api-e2e.ts` 服务器 harness + `vitest.api.config.ts` + `tests/api/helpers/http.ts` + `tests/api/helpers/seed.ts` | 构建基础设施，跑通空套件 |
| **Phase 1** | `live.test.ts`, `api.test.ts` (health) | 无额外依赖 | 纯 HTTP GET，验证 harness 可用 |
| **Phase 2** | `worker-status.test.ts` | seed.ts: cron-history seed via D1 HTTP API | 需要 D1 test DB 环境变量就位 |
| **Phase 3** | `api.test.ts` (lookup/record-click), `api-extra.test.ts` | seed.ts: links seed + click 副作用查询 | 白盒→黑盒断言重写 |
| **Phase 4** | `sync-kv.test.ts`, `cleanup.test.ts` | WORKER_SECRET env + KV/R2 副作用验证 | 需要 R2 替代方案决策 |
| **Phase 5** | `webhook.test.ts`, `tmp-upload.test.ts` | webhook/folder seed + R2 完整集成 | 最高难度，R2 mock 断言全部重写 |

##### 改动文件

**基础设施层**（Phase 0）：
- `scripts/run-api-e2e.ts` — server harness（启停 dev server，health check 轮询，进程管理）
- `vitest.api.config.ts` — 独立 vitest config，**不加载 `tests/setup.ts`**（不注入 D1 内存模拟器）
- `tests/api/helpers/http.ts` — fetch wrapper（base URL `http://localhost:17005`、common headers、response assert helpers）
- `tests/api/helpers/seed.ts` — 测试数据生命周期管理（通过 Cloudflare D1 HTTP API 直接操作 test DB：insert/delete/query）
- `.env.test.api` — API E2E 专用环境变量（`CF_D1_DATABASE_ID`、`CF_D1_ACCOUNT_ID`、`CF_D1_API_TOKEN`、`WORKER_SECRET`、`E2E_SKIP_AUTH=1`）

**测试文件**（Phase 1-5）：
- `tests/api/*.test.ts` — 逐文件重写：import → fetch、mock 断言 → 黑盒断言

**run-api-e2e.ts 流程**：
```
1. 加载 .env.test.api 环境变量
2. 启动 Next.js dev server (port 17005, E2E_SKIP_AUTH=1)
   — server 连接真实 D1 test DB，不使用内存模拟器
3. 轮询 GET http://localhost:17005/api/health 等待就绪（超时 30s）
4. 运行 vitest tests/api --config vitest.api.config.ts
5. 无论结果如何，SIGTERM 关闭 server
6. 返回测试退出码
```

**端口规划更新**：

| 端口 | 用途 |
|------|------|
| 7005 | 开发服务器 |
| 17005 | L2 API Integration E2E（新增） |
| 27005 | L3 Playwright BDD E2E |

##### 原子化提交

| # | Commit | 内容 | Phase |
|---|--------|------|-------|
| 4b.1 | `feat: add run-api-e2e.ts server harness` | `scripts/run-api-e2e.ts` + `.env.test.api` template | Phase 0 |
| 4b.2 | `feat: add vitest.api.config.ts for HTTP-based API tests` | 独立 config，不加载内存模拟器 | Phase 0 |
| 4b.3 | `feat: add HTTP helpers and D1 seed utilities for API E2E` | `tests/api/helpers/http.ts` + `tests/api/helpers/seed.ts` | Phase 0 |
| 4b.4 | `test: migrate live and health API tests to real HTTP` | `live.test.ts`, `api.test.ts` (health) | Phase 1 |
| 4b.5 | `test: migrate worker-status API tests to real HTTP` | `worker-status.test.ts` + cron seed | Phase 2 |
| 4b.6 | `test: migrate lookup and record-click API tests to real HTTP` | `api.test.ts` (lookup/record-click), `api-extra.test.ts` | Phase 3 |
| 4b.7 | `test: migrate sync-kv and cleanup API tests to real HTTP` | `sync-kv.test.ts`, `cleanup.test.ts` | Phase 4 |
| 4b.8 | `test: migrate webhook and tmp-upload API tests to real HTTP` | `webhook.test.ts`, `tmp-upload.test.ts` | Phase 5 |
| 4b.9 | `chore: update test:api script to use run-api-e2e.ts` | `package.json` script 切换 | — |

##### 前置决策（执行前必须确认）

| # | 决策 | 选项 | 推荐 |
|---|------|------|------|
| 1 | **D1 测试数据库** | A: 复用 Playwright 的远程 D1（已有 `CF_D1_*` 凭证）<br>B: 新建独立 D1 test DB | A — 避免维护两套 DB，Playwright 已验证方案可行 |
| 2 | **R2 测试存储** | A: miniflare 本地 R2 模拟器<br>B: 独立 R2 test bucket<br>C: Phase 4/5 暂缓，保留 in-process 版本 | C → A — 先完成 Phase 1-3（无 R2 依赖），再决定 R2 方案 |
| 3 | **数据准备方式** | A: 测试直接通过 D1 HTTP API seed<br>B: 专用 `/api/test/seed` 内部端点 | A — 不往生产代码中添加 test-only 端点 |
| 4 | **断言策略** | A: 全部黑盒（response + DB 查询）<br>B: 混合（简单端点黑盒，R2 端点保留 in-process） | B — Phase 1-3 黑盒，Phase 4-5 按 R2 决策定 |

---

### Step 5: 文档与 Hook 重组

**改动文件**：
- `docs/05-testing.md` — 重写，对齐新质量体系（L1+L2+L3+G1+G2）
- `CLAUDE.md` — 更新 Testing section，替换旧四层引用
- `.husky/pre-commit` — 最终形态确认
- `.husky/pre-push` — 最终形态确认

**原子化提交**：

| # | Commit | 内容 |
|---|--------|------|
| 5.1 | `docs: update testing docs to quality system (L1+L2+L3+G1+G2)` | `docs/05-testing.md` 重写 |
| 5.2 | `docs: update CLAUDE.md testing section` | CLAUDE.md 对齐新体系 |
| 5.3 | `docs: archive four-layer test plan` | `docs/11-four-layer-test-plan.md` 移至 `docs/archive/` 或标记为 archived |

**最终 Hook 形态**：

**.husky/pre-commit**：
```bash
# L1: Unit tests + coverage gate (≥90%)
bun run test:unit:coverage
bun run test:integration

# G1: Static analysis
bun run typecheck
bunx lint-staged

# G2: Secrets scanning
source "$(dirname "$0")/../scripts/ensure-tools.sh"
if check_tool gitleaks "secrets scanning"; then
  gitleaks protect --staged --no-banner
fi
```

**.husky/pre-push**：
```bash
# L2: Integration/API tests (real HTTP)
bun run test:api

# G2: Dependency vulnerability scanning
source "$(dirname "$0")/../scripts/ensure-tools.sh"
if check_tool osv-scanner "dependency audit" && [ -f bun.lock ]; then
  osv-scanner --lockfile=bun.lock
fi
```

---

## 四、执行顺序与依赖关系

```
Step 1: G1 — fix type errors + tsc --noEmit     独立，必须先行
    ↓
Step 2: G1 — ESLint strict                       依赖 Step 1（一起验证 pre-commit）
    ↓
Step 3: G2 — 安全门控                              独立（可与 Step 2 并行）
    ↓
Step 4a: 拆分 tests/api/ 目录                      独立于 G1/G2，但必须在 4b 之前
    ↓
Step 4b: Route handler 测试迁移真 HTTP             依赖 4a，分 5 个 phase
    ↓
Step 5: 文档重组                                    依赖前四步全部完成
```

---

## 五、验证清单

完成所有步骤后，逐项确认：

- [ ] `bun run typecheck` — 0 errors（G1）
- [ ] `bun run lint` — 0 errors, 0 warnings，strict rules 生效（G1）
- [ ] `bun run test:unit:coverage` — 全部通过，覆盖率 ≥ 90%（L1）
- [ ] `bun run test:integration` — server action 测试全部通过（L1）
- [ ] `bun run test:api` — 全部通过，走真 HTTP（L2）
- [ ] `osv-scanner --lockfile=bun.lock` — 无已知漏洞（G2）
- [ ] `gitleaks protect --staged --no-banner` — 无 secrets 泄露（G2）
- [ ] `bun run test:e2e:pw` — Playwright 全部通过（L3）
- [ ] `git commit` 触发 pre-commit hook — L1 + G1 + G2(gitleaks) 全通过
- [ ] `git push` 触发 pre-push hook — L2 + G2(osv-scanner) 全通过
- [ ] `docs/05-testing.md` 反映新质量体系
- [ ] `CLAUDE.md` 无旧版四层测试引用

---

## 六、回退策略

每个 Step 的提交都是独立的，如果某个 Step 引入问题：

- **Step 1（type errors）**：`git revert` 对应提交，type errors 回到 "已知但不阻塞" 状态
- **Step 2（ESLint strict）**：`git revert` eslint config 提交，恢复旧规则
- **Step 3（G2）**：从 hook 文件删除安全扫描行
- **Step 4a（目录拆分）**：`git mv` 反向移回
- **Step 4b（真 HTTP）**：逐文件 revert 到 import 模式，恢复旧 `test:api` script
- **Step 5（文档）**：`git revert` 文档提交

---

## 相关文档

- [测试策略](05-testing.md) — 升级后将反映新质量体系
- [旧版四层测试计划](11-four-layer-test-plan.md) — 升级后归档
- [E2E 覆盖分析](09-e2e-coverage-analysis.md)
- [架构概览](01-architecture.md)
