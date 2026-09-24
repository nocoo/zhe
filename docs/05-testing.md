# 质量体系：六维测试金字塔

本文档描述 Zhe 项目的完整质量保障体系（L1 + L2 + L3 + G1 + G2 + Worker），作为标杆项目供其他项目参考。

> 返回 [README](../README.md) | 参考 [质量体系升级设计](13-quality-system-upgrade.md)

---

## 一、体系概览

### 测试金字塔

```
                        ┌─────────────┐
                        │   L3 (148)  │  ← on-demand (Playwright BDD)
                        │   Manual    │
                    ┌───┴─────────────┴───┐
                    │      L2 (197)       │  ← pre-push (API E2E)
                    │   真实 HTTP 请求     │
                ┌───┴─────────────────────┴───┐
                │         L1 (2,583)          │  ← pre-commit
                │  Unit + Integration + Cov   │
            ┌───┴─────────────────────────────┴───┐
            │          Worker (72)                │  ← on-demand
            │      Edge Worker 单元测试            │
        ┌───┴─────────────────────────────────────┴───┐
        │              G1 + G2 (静态分析 + 安全)         │  ← pre-commit + pre-push
        │   TypeScript + Biome + gitleaks + osv-scanner  │
        └─────────────────────────────────────────────────┘
```

### 层级定义

| 层级 | 名称 | 验证对象 | 执行时机 | 门控类型 |
|------|------|----------|----------|----------|
| **L1** | 单元 + 集成测试 | 纯函数、ViewModel、Hooks、Server Actions、组件 | pre-commit | Hard |
| **L2** | API E2E | 真实 HTTP 请求到运行中的 Next.js 服务器 | pre-push | Hard |
| **L3** | 系统 E2E | 真实用户端到端流程（Playwright 浏览器自动化） | on-demand | Hard |
| **G1** | 静态分析 | 类型检查 (`tsc --noEmit`) + Biome (`--error-on-warnings`) | pre-commit | Hard |
| **G2** | 安全检查 | Secrets 泄露 (gitleaks) + 依赖漏洞 (osv-scanner) | pre-commit + pre-push | Hard |
| **Worker** | Edge Worker | Cloudflare Worker 边缘逻辑 | on-demand | Hard |

### 历史指标（2026-04-20，不代表当前契约）

| 指标 | 当前值 | 目标 |
|------|--------|------|
| L1 测试数量 | 2,583 | - |
| L1 语句覆盖率 | 98.25% | ≥ 90% |
| L1 分支覆盖率 | 92.62% | ≥ 80% |
| L1 函数覆盖率 | 98.16% | ≥ 85% |
| L1 行覆盖率 | 99.33% | ≥ 90% |
| L2 API 路由覆盖 | 21/21 (100%) | 100% |
| L2 测试数量 | 197 | - |
| L3 页面覆盖 | 16/16 (100%) | 100% |
| L3 测试数量 | 148 | - |
| Worker 测试数量 | 72 | - |
| **总测试数量** | **3,000** | - |

---

## 二、各层级详细设计

### L1：单元 + 集成测试

#### 设计目标

- **快速反馈**：pre-commit 执行，<30 秒完成
- **覆盖率契约**：语句、分支、函数、行各 ≥95%；当前较低的执行门槛是待修复差距，不能降低契约
- **隔离性**：通过 `vi.mock` + D1 内存模拟器，不依赖外部服务

#### 测试范围

| 类型 | 目录 | 说明 |
|------|------|------|
| 单元测试 | `tests/unit/` | 纯函数、工具函数、模型逻辑 |
| 组件测试 | `tests/components/` | React 组件渲染和交互 |
| 集成测试 | `tests/integration/` | Server Actions + Route Handler（in-process） |

#### 技术栈

| 工具 | 用途 |
|------|------|
| [Vitest](https://vitest.dev) | 测试运行器 |
| [React Testing Library](https://testing-library.com) | 组件测试 |
| [happy-dom / jsdom](https://github.com/capricorn86/happy-dom) | 浏览器环境模拟（按文件级 `@vitest-environment` 指令启用） |
| [@vitest/coverage-v8](https://vitest.dev/guide/coverage) | 代码覆盖率 |

#### 关键配置

**`vitest.config.ts`**：
- 默认环境：`node`（DOM 用例通过文件首行 `// @vitest-environment happy-dom` 或 `jsdom` 指令切换）
- Setup：`tests/setup.ts`（D1 内存模拟器，mock 的是 `@/lib/db/d1-client`）
- 包含：`tests/**/*.{test,spec}.{ts,tsx}`
- 排除：`tests/playwright/**`、`node_modules/**`
- 当前执行：v8 provider，全局 `lines/statements ≥95`、`functions ≥90`、`branches ≥85`。要求为四项各 ≥95%，函数/分支和未覆盖逻辑是待修复差距；CLI 与 Worker 的独立缺口见根手册。

**D1 内存模拟器**（`tests/setup.ts`）：
```typescript
// 全局 mock @/lib/db/d1-client，使用 Map/Array 模拟数据库
vi.mock('@/lib/db/d1-client', async () => ({
  isD1Configured: () => true,
  executeD1Query: /* 内存 SQL 解释器 */,
  executeD1Batch: /* 顺序执行多条语句 */,
}));
```

> 历史记录：早期默认环境为 `jsdom` 且 mock 的是 `@/lib/db`。当前默认环境是 `node`，DOM 用例靠文件级 `@vitest-environment` 指令启用，mock 目标是更细粒度的 `@/lib/db/d1-client`。补 UT 时按当前配置实现。

#### 命令

```bash
bun run test:unit           # 单元测试（排除 api/ 和 integration/）
bun run test:unit:coverage  # 单元测试 + 覆盖率门槛检查
bun run test:integration    # 集成测试（Server Actions）
```

---

### L2：API E2E 测试

#### 设计目标与当前入口

`bun run test:api` 调用 `scripts/run-api-e2e.ts`，启动本地 Worker/SQLite/KV/R2 与 Next.js 17006，通过真实 HTTP 断言响应和数据副作用。导入 handler 的 mock 测试属于 L1。

`test-stack.ts` 在本地应用全部 migrations，注入测试 env，校验 `_test_marker`，并负责 readiness、退出和清理。Worker 8788、R2 shim 18788；应用使用 `.next/test`。生产 Cloudflare 凭据和旧的远端 `*_TEST_*` 资源变量均不需要。

L2 是 pre-push/CI 的硬检查。完整 endpoint/method 100% 清单覆盖、每次运行独立目录，以及清理前的目录/marker 检查仍是质量差距；不要把当前固定 `.test-storage` 描述成完整 per-run 隔离。不得使用生产或日常开发存储。

#### 测试文件

```
tests/api/
├── api.test.ts              # /api/health, /api/lookup, /api/record-click
├── auth.test.ts             # 认证相关
├── backy-pull.test.ts       # Backy 同步
├── cleanup.test.ts          # /api/cron/cleanup
├── d1-proxy.test.ts         # D1 代理端点
├── live.test.ts             # /api/live
├── sync-kv.test.ts          # /api/cron/sync-kv
├── tmp-upload.test.ts       # 临时文件上传
├── webhook.test.ts          # Webhook 创建链接
├── webhook-invalidation.test.ts
├── worker-status.test.ts    # Worker 状态
└── v1/                      # v1 API
    ├── folders.test.ts      # CRUD
    ├── ideas.test.ts        # CRUD
    ├── ideas-by-id.test.ts
    ├── ideas-patch.test.ts
    ├── idempotency.test.ts  # 幂等性
    ├── links.test.ts        # CRUD
    ├── links-by-id.test.ts
    ├── links-patch.test.ts
    ├── rate-limit.test.ts   # 限流
    ├── tags.test.ts         # CRUD
    └── uploads.test.ts      # 文件上传
```

#### 命令

```bash
bun run test:api  # 启动 dev server，运行 API E2E 测试
```

---

### L3：Playwright BDD E2E

#### 设计目标

- **用户视角**：模拟真实用户操作浏览器
- **完整流程**：登录 → 操作 → 验证
- **可视化调试**：失败时截图，支持 UI 模式

#### 配置

**`playwright.config.ts`**：
- 端口：27006（与开发 7006、API E2E 17006 完全隔离）
- 服务器：`PLAYWRIGHT=1 AUTH_URL=http://localhost:27006 bun run next dev --turbopack -p 27006`
- `reuseExistingServer: false`：每次都启动全新实例
- 串行执行：`fullyParallel: false`, `workers: 1`（避免数据竞争）
- 浏览器：Chromium（Desktop Chrome）

#### 生命周期

```
1. global-setup.ts    → 向 D1 插入测试用户，验证 _test_marker
2. auth.setup.ts      → 通过 CredentialsProvider 登录，保存 session cookie
3. *.spec.ts          → 各场景测试（使用已认证的 storageState）
4. global-teardown.ts → 清理测试数据
```

#### 测试文件

| Spec 文件 | 功能模块 | 测试数 |
|-----------|----------|--------|
| `auth-guard.spec.ts` | 认证守卫 | 5 |
| `backy.spec.ts` | Backy 集成 | 10 |
| `data-management.spec.ts` | 数据管理 | 4 |
| `folders.spec.ts` | 文件夹 | 4 |
| `landing.spec.ts` | 落地页 | 3 |
| `link-crud.spec.ts` | 链接 CRUD | 8 |
| `navigation.spec.ts` | 导航 | 13 |
| `not-found.spec.ts` | 404 页面 | 6 |
| `overview.spec.ts` | 概览/分析 | 7 |
| `redirect.spec.ts` | 短链接重定向 | 2 |
| `search.spec.ts` | 搜索 (Cmd+K) | 8 |
| `storage.spec.ts` | 存储管理 | 6 |
| `tags.spec.ts` | 标签 | 8 |
| `uploads.spec.ts` | 文件上传 | 10 |
| `webhook.spec.ts` | Webhook | 9 |
| `xray.spec.ts` | Xray (Twitter) | 9 |
| `api-keys.spec.ts` | API Keys 管理 | 15 |
| `ideas.spec.ts` | 想法 CRUD | 21 |

#### 命令

```bash
bun run test:e2e:pw      # Playwright BDD E2E（headless）
bun run test:e2e:pw:ui   # Playwright UI 模式（调试）
```

---

### G1：静态分析

#### 设计目标

- **类型安全**：`tsc --noEmit` 确保 TypeScript 类型正确
- **代码质量**：Biome 零警告策略（`biome check --error-on-warnings`）

#### TypeScript 检查

**`scripts/typecheck.sh`**：
```bash
#!/usr/bin/env bash
set -euo pipefail

# 确保 .next/types 存在（Next.js 路由类型）
if [ ! -d ".next/types" ]; then
  echo "⚠️  .next/types not found — running next build to generate route types..."
  bun run build --no-lint
fi

exec bun x tsc --noEmit
```

#### Biome 配置

全仓统一 **Biome**（主应用 / `worker/` / `cli/`），根配置 `biome.json`（worker/cli 以 `extends` 继承）。

| 规则族 | 策略 |
|------|------|
| `correctness/noUnusedVariables` | error |
| `correctness/noUnusedImports` | error |
| `style/noNonNullAssertion` | error |
| `suspicious/noExplicitAny` | error（测试目录 off） |
| `suspicious/noFocusedTests` / `noSkippedTests` | error（测试） |
| `complexity/noExcessiveCognitiveComplexity` | warn，max 35（scripts/tests off） |

#### lint-staged 增量 Lint

pre-commit 使用 **lint-staged** 只检查暂存区文件：

```bash
# .husky/pre-commit 中
bunx lint-staged
```

`package.json` → `lint-staged`：

```json
{
  "*.{ts,tsx,js,jsx,json,css,md}": [
    "biome check --error-on-warnings --no-errors-on-unmatched"
  ]
}
```

#### 命令

```bash
bun run typecheck  # TypeScript 类型检查
bun run lint       # Biome check（零警告）
bun run lint:fix   # Biome 自动修复
bun run format     # Biome format
```

---

### G2：安全检查

#### 设计目标

- **Secrets 保护**：防止敏感信息提交到代码库
- **依赖审计**：检测已知漏洞的依赖包

#### 工具

| 工具 | 用途 | 执行时机 |
|------|------|----------|
| [gitleaks](https://github.com/gitleaks/gitleaks) | 扫描暂存区的 secrets | pre-commit |
| [osv-scanner](https://github.com/google/osv-scanner) | 扫描 lockfile 依赖漏洞 | pre-push |

#### 安装

```bash
brew install gitleaks osv-scanner
```

#### 工具检查脚本

**`scripts/ensure-tools.sh`**：
```bash
#!/usr/bin/env bash
# 检查工具是否可用，不可用时打印安装提示

require_tool() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌ $1 not found. Install: brew install $1"
    echo "   Required for $2"
    exit 1
  fi
}
```

---

### Worker：Edge Worker 测试

#### 设计目标

- **边缘逻辑验证**：测试 Cloudflare Worker 的所有路由分支
- **独立运行**：与主项目测试隔离

#### 测试范围

| 模块 | 测试组 | 测试数 |
|------|--------|--------|
| Fetch Handler | forwarding to origin | 7 |
| Fetch Handler | KV redirect | 12 |
| Fetch Handler | reserved path detection | 2 |
| Fetch Handler | negative cache | 3 |
| Fetch Handler | geo header passthrough | 1 |
| Scheduled Handler | cron triggers | 5 |
| D1 Proxy | authentication | 4 |
| D1 Proxy | request validation | 3 |
| D1 Proxy | SQL execution | 5 |
| D1 Proxy | error handling | 5 |
| D1 Proxy | routing | 6 |
| D1 Batch | batch operations | 6+ |

#### 命令

```bash
cd worker && bun run test  # Worker 单元测试
```

---

### Browser matrix scope

The ordinary L3 suite runs shared workflows once per meaningful UI variant:

- X media deletion and live refresh run on desktop. Mobile X layout, touch interaction,
  playback and filtering remain covered by the other connector journeys; mobile
  cross-tab deletion is no longer a separate browser acceptance case.
- GitHub source filtering and README journeys run at 1365px and 320px. The repeated
  1920px and 390px full workflows are removed.
- Card reflow covers grid, list, X and GitHub layouts. Uncategorized links use the
  same list controls; their route and source-filter behavior remain covered by
  navigation and GitHub tests instead of repeating four reflow workflows.

- Enriched search runs its keyboard, source-filter and backend journey once. The
  same journey then checks the search page at 390px; a second complete mobile
  keyboard/backend replay is removed.

This removes eight browser cases. CI still rejects flaky retained cases; security,
tenant isolation, data deletion assertions, coverage thresholds and retries are unchanged.
The manual L3 stress workflow remains available for targeted investigation.

## 三、Git Hooks 执行流程

### pre-commit（L1 + G1 + G2）

```bash
#!/usr/bin/env bash
# 5 个任务并行执行，任一失败则阻止提交

run_bg unit_cov   bun run test:unit:coverage   # L1 单元 + 覆盖率门槛
run_bg integ      bun run test:integration      # L1 集成测试
run_bg typecheck  bun run typecheck             # G1 tsc --noEmit
run_bg lint       bunx lint-staged              # G1 Biome（仅变更文件）
run_bg gitleaks   gitleaks protect --staged     # G2 secrets 扫描
```

**执行时间**：~10 秒

### pre-push（L2 + G2）

```bash
#!/usr/bin/env bash
# 2 个任务并行执行，任一失败则阻止推送

bun run test:api              # L2 API E2E（启动 dev server，真实 HTTP）
osv-scanner scan --lockfile   # G2 依赖漏洞扫描
```

**执行时间**：~15 秒

### on-demand（L3 + Worker）

```bash
bun run test:e2e:pw           # L3 Playwright BDD E2E
cd worker && bun run test     # Worker 单元测试
```

**执行时间**：~3 分钟

---

## 四、端口分配

| 端口 | 用途 |
|------|------|
| 7006 | 开发服务器（`bun run dev`） |
| 17006 | L2 API E2E 测试（`run-api-e2e.ts` 自动管理） |
| 27006 | L3 Playwright BDD E2E 测试（`playwright.config.ts` 自动管理） |

---

## 五、测试目录结构

```
tests/
├── unit/               # L1: 纯函数、逻辑、工具测试
├── components/         # L1: React 组件测试
├── integration/        # L1: Server Actions 集成测试 (in-process)
├── api/                # L2: API 路由真 HTTP E2E 测试
│   ├── helpers/
│   │   ├── http.ts         # fetch wrapper
│   │   └── seed.ts         # D1 HTTP API seed/teardown
│   └── v1/                 # v1 API 测试
├── playwright/         # L3: Playwright BDD E2E 测试
│   ├── fixtures/           # 自定义 test fixtures
│   ├── helpers/            # D1 数据库辅助函数
│   ├── global-setup.ts     # 插入测试用户到 D1
│   ├── global-teardown.ts  # 清理测试数据
│   ├── *.setup.ts          # 认证 setup
│   └── *.spec.ts           # BDD 场景
├── mocks/              # 共享 Mock 数据
└── setup.ts            # 全局测试配置（D1 内存模拟器）

worker/
└── test/               # Worker 单元测试
    └── index.test.ts
```

---

## 六、测试命令速查

| 命令 | 层级 | 说明 |
|------|------|------|
| `bun run test` | — | Watch 模式 |
| `bun run test:run` | — | 单次运行（全部测试） |
| `bun run test:unit` | L1 | 仅单元测试（排除 api/ 和 integration/） |
| `bun run test:unit:coverage` | L1 | 单元测试 + 覆盖率门槛检查 |
| `bun run test:integration` | L1 | Server Actions 集成测试 |
| `bun run test:api` | L2 | API E2E 测试（启动 dev server，真 HTTP） |
| `bun run test:e2e:pw` | L3 | Playwright BDD E2E |
| `bun run test:e2e:pw:ui` | L3 | Playwright UI 模式（调试用） |
| `bun run test:coverage` | — | 覆盖率报告 |
| `bun run typecheck` | G1 | TypeScript 类型检查 |
| `bun run lint` | G1 | Biome check（零警告） |
| `cd worker && bun run test` | Worker | Worker 单元测试 |

---

## 七、测试环境隔离

L2/L3 均使用 `scripts/test-stack.ts` 管理的本地栈，不能创建或部署远端 `-test` Worker、D1、KV、R2。

| 组件 | 当前本地实现 | 尚需完善 |
|---|---|---|
| D1 / KV | Wrangler + SQLite，`.test-storage/wrangler`，Worker 8788 | 固定目录改为每次运行独立目录 |
| R2 | `.test-storage/r2` + test-only HTTP shim 18788 | 每次运行隔离；禁止作为生产 shim |
| Next | L2 17006、L3 27006，`.next/test` | 两层仍共享存储/输出，当前必须串行 |
| 数据 guard | Loopback D1 proxy、`_test_marker(env=test)` 和测试 env 覆盖 | 首次删除目录前验证本地目录归属与 marker |

测试入口会覆盖本地资源变量并清除生产 Cloudflare 资源身份；测试不需要 `CLOUDFLARE_API_TOKEN` 或旧远端 test 资源变量。不要为了运行测试复制生产 secrets。
`applySchemaFixups()` 的临时列修补必须同时补真实 migration，避免生产 schema 漂移。

## 八、CI/CD 集成

`.github/workflows/ci.yml` 是当前执行依据：共享 quality 跑 web L1/G1/G2/build，CLI job 跑 build/lint/coverage/Python unittest，Worker job 跑单元测试，API/browser job 跑本地 L2/L3。Wrangler matrix 的实验版本允许失败，稳定行才是硬结果。

CI 当前还传递 `AUTH_SECRET` 和 `WORKER_SECRET` 名称，但远端 Cloudflare 测试资源已经退役；本地 runner 的测试覆写不应依赖生产值。完整 CLI/Worker 质量门、四指标 coverage、push-ref 扫描和每次运行隔离的现状见根 [AGENTS.md](../AGENTS.md)。

## 九、Git Hook 绕过禁令

### 零容忍政策

**严禁**使用以下命令绕过 Git Hooks：

```bash
# ❌ 禁止
git commit --no-verify
git push --no-verify
```

### 为什么禁止

| 风险 | 后果 |
|------|------|
| 跳过 L1 测试 | 破坏代码可能合入 main |
| 跳过 G1 类型检查 | TypeScript 错误逃逸 |
| 跳过 G2 gitleaks | Secrets 泄露到远端 |
| 跳过 L2 API E2E | 接口回归未被发现 |
| 跳过 osv-scanner | 已知漏洞依赖进入生产 |

### 违规后果

- **代码审查**：发现 `--no-verify` 提交记录，PR 直接驳回
- **CI 兜底**：即使本地跳过，CI 仍会执行完整检查并阻止合并

### Hook 故障

通过正常流程诊断并修复 hook；不得用 `--no-verify` 跳过提交或推送检查。

## 十、覆盖率分析与优化空间

### 当前低覆盖文件（分支覆盖率 < 85%）

| 文件 | 分支覆盖率 | 问题 |
|------|-----------|------|
| `storage.ts` | 77.27% | 错误处理分支未测试 |
| `webhook-page.tsx` | 75% | Slider 边界条件 |
| `upload-zone.tsx` | 81.81% | 拖拽事件边界 |
| `upload-list.tsx` | 83.33% | Slider 边界条件 |

### 推荐改进

| 优先级 | 任务 | 预计测试增量 |
|--------|------|-------------|
| P1 | 提升 `storage.ts` 分支覆盖至 90%+ | +3-5 L1 |
| P1 | 添加 `api-keys.test.ts` 集成测试 | +8-10 L1 |
| P2 | Slider 组件边界测试 | +4-6 L1 |

---

## 十一、相关文档

- [架构概览](01-architecture.md)
- [开发规范](07-contributing.md)
- [质量体系升级设计](13-quality-system-upgrade.md)
- [Cloudflare 资源清单与测试隔离](14-cloudflare-resource-inventory.md)
- [E2E 覆盖分析](09-e2e-coverage-analysis.md)
