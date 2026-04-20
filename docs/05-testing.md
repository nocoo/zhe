# 质量体系：六维测试金字塔

本文档描述 Zhe 项目的完整质量保障体系（L1 + L2 + L3 + G1 + G2 + Worker），作为标杆项目供其他项目参考。

> 返回 [README](../README.md) | 参考 [质量体系升级设计](13-quality-system-upgrade.md)

---

## 一、体系概览

### 测试金字塔

```
                        ┌─────────────┐
                        │   L3 (112)  │  ← on-demand (Playwright BDD)
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
        │   TypeScript + ESLint + gitleaks + osv-scanner │
        └─────────────────────────────────────────────────┘
```

### 层级定义

| 层级 | 名称 | 验证对象 | 执行时机 | 门控类型 |
|------|------|----------|----------|----------|
| **L1** | 单元 + 集成测试 | 纯函数、ViewModel、Hooks、Server Actions、组件 | pre-commit | Hard |
| **L2** | API E2E | 真实 HTTP 请求到运行中的 Next.js 服务器 | pre-push | Hard |
| **L3** | 系统 E2E | 真实用户端到端流程（Playwright 浏览器自动化） | on-demand | Hard |
| **G1** | 静态分析 | 类型检查 (`tsc --noEmit`) + ESLint strict | pre-commit | Hard |
| **G2** | 安全检查 | Secrets 泄露 (gitleaks) + 依赖漏洞 (osv-scanner) | pre-commit + pre-push | Hard |
| **Worker** | Edge Worker | Cloudflare Worker 边缘逻辑 | on-demand | Hard |

### 当前指标（2026-04-20）

| 指标 | 当前值 | 目标 |
|------|--------|------|
| L1 测试数量 | 2,583 | - |
| L1 语句覆盖率 | 98.25% | ≥ 90% |
| L1 分支覆盖率 | 92.62% | ≥ 80% |
| L1 函数覆盖率 | 98.16% | ≥ 85% |
| L1 行覆盖率 | 99.33% | ≥ 90% |
| L2 API 路由覆盖 | 21/21 (100%) | 100% |
| L2 测试数量 | 197 | - |
| L3 页面覆盖 | 14/16 (87.5%) | 100% |
| L3 测试数量 | 112 | - |
| Worker 测试数量 | 72 | - |
| **总测试数量** | **2,964** | - |

---

## 二、各层级详细设计

### L1：单元 + 集成测试

#### 设计目标

- **快速反馈**：pre-commit 执行，<30 秒完成
- **高覆盖率**：语句 ≥90%，作为代码质量的基础保障
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
| [jsdom](https://github.com/jsdom/jsdom) | 浏览器环境模拟 |
| [@vitest/coverage-v8](https://vitest.dev/guide/coverage) | 代码覆盖率 |

#### 关键配置

**`vitest.config.ts`**：
- 环境：`jsdom`
- Setup：`tests/setup.ts`（D1 内存模拟器）
- 排除：`tests/api/**`（L2）、`tests/integration/**`（独立运行）

**D1 内存模拟器**（`tests/setup.ts`）：
```typescript
// 全局 mock executeD1Query，使用 Map/Array 模拟数据库
vi.mock('@/lib/db', () => ({
  executeD1Query: vi.fn().mockImplementation(/* 内存实现 */),
}));
```

#### 命令

```bash
bun run test:unit           # 单元测试（排除 api/ 和 integration/）
bun run test:unit:coverage  # 单元测试 + 覆盖率门槛检查
bun run test:integration    # 集成测试（Server Actions）
```

---

### L2：API E2E 测试

#### 设计目标

- **真实 HTTP**：测试完整的请求-响应周期，包括中间件、路由、数据库
- **黑盒断言**：验证 HTTP response + 数据库副作用，不依赖内部 mock
- **环境隔离**：使用独立的 Cloudflare 测试资源

#### 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    run-api-e2e.ts                               │
│  1. 加载 .env.local 测试环境变量                                  │
│  2. 覆盖 D1/R2/KV 为测试资源                                      │
│  3. 启动 Next.js dev server (port 17006)                        │
│  4. 等待 /api/health 就绪                                        │
│  5. 运行 vitest (vitest.api.config.ts)                          │
│  6. 关闭 server，返回退出码                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Next.js Dev Server (17006)                      │
│  • PLAYWRIGHT=1 → 启用 e2e-credentials 认证                      │
│  • CLOUDFLARE_D1_DATABASE_ID → 测试 D1                          │
│  • D1_PROXY_URL → 测试 Worker (zhe-edge-test)                   │
│  • R2_BUCKET_NAME → 测试 R2 bucket                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Cloudflare 测试资源                              │
│  • zhe-db-test (D1)                                             │
│  • zhe-test (R2)                                                │
│  • zhe-test (KV)                                                │
│  • zhe-edge-test (Worker)                                       │
└─────────────────────────────────────────────────────────────────┘
```

#### 安全防线（四重隔离）

1. **测试入口 env 覆盖**：`main()` 将 `CLOUDFLARE_D1_DATABASE_ID` 覆盖为 `D1_TEST_DATABASE_ID`
2. **ID 不等性检查**：`testDbId !== prodDbId`，防止误配回生产
3. **防御性 guard**：`executeD1()` / `queryD1()` 中确认覆盖已生效
4. **`_test_marker` 标记表**：测试 D1 中有标记行，生产 D1 无此表

#### Hard Gate 设计

L2 测试是 **Hard Gate**——所有必需的环境变量必须正确配置，否则 pre-push 将失败：

| 环境变量 | 用途 | 必需 |
|----------|------|------|
| `D1_TEST_DATABASE_ID` | 测试 D1 数据库 ID | ✅ |
| `D1_TEST_PROXY_URL` | 测试 Worker URL（必须含 "-test"） | ✅ |
| `D1_TEST_PROXY_SECRET` | 测试 Worker D1 代理密钥 | ✅ |
| `R2_TEST_BUCKET_NAME` | 测试 R2 bucket | ✅ |
| `R2_TEST_PUBLIC_DOMAIN` | 测试 R2 公开域名 | ✅ |
| `KV_TEST_NAMESPACE_ID` | 测试 KV namespace | 可选 |

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

#### 待补充覆盖

| 页面 | 状态 |
|------|------|
| `api-keys` | ❌ 无 L3 覆盖 |
| `ideas` | ❌ 无 L3 覆盖 |

#### 命令

```bash
bun run test:e2e:pw      # Playwright BDD E2E（headless）
bun run test:e2e:pw:ui   # Playwright UI 模式（调试）
```

---

### G1：静态分析

#### 设计目标

- **类型安全**：`tsc --noEmit` 确保 TypeScript 类型正确
- **代码质量**：ESLint strict 规则，零警告策略

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

#### ESLint 配置

启用 `@typescript-eslint/strict` 规则：

| 规则 | 值 |
|------|-----|
| `@typescript-eslint/no-unused-vars` | error |
| `@typescript-eslint/no-explicit-any` | error |
| `@typescript-eslint/no-non-null-assertion` | error |
| `@typescript-eslint/no-unnecessary-condition` | error |
| `@typescript-eslint/prefer-nullish-coalescing` | error |

#### 命令

```bash
bun run typecheck  # TypeScript 类型检查
bun run lint       # ESLint strict（零警告）
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

## 三、Git Hooks 执行流程

### pre-commit（L1 + G1 + G2）

```bash
#!/usr/bin/env bash
# 5 个任务并行执行，任一失败则阻止提交

run_bg unit_cov   bun run test:unit:coverage   # L1 单元 + 覆盖率门槛
run_bg integ      bun run test:integration      # L1 集成测试
run_bg typecheck  bun run typecheck             # G1 tsc --noEmit
run_bg lint       bunx lint-staged              # G1 ESLint（仅变更文件）
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
| `bun run lint` | G1 | ESLint strict（零警告） |
| `cd worker && bun run test` | Worker | Worker 单元测试 |

---

## 七、测试环境隔离

### Cloudflare 资源分离

| 资源类型 | 生产 | 测试 |
|----------|------|------|
| D1 Database | `zhe-db` | `zhe-db-test` |
| R2 Bucket | `zhe` | `zhe-test` |
| KV Namespace | `zhe` | `zhe-test` |
| Worker | `zhe-edge` | `zhe-edge-test` |

### 环境变量配置

开发者必须在 `.env.local` 中配置以下变量才能运行测试：

```bash
# 测试 D1
D1_TEST_DATABASE_ID=xxx          # 必须不等于 CLOUDFLARE_D1_DATABASE_ID

# 测试 Worker（D1 代理）
D1_TEST_PROXY_URL=https://zhe-edge-test.xxx.workers.dev  # URL 必须含 "-test"
D1_TEST_PROXY_SECRET=xxx

# 测试 R2
R2_TEST_BUCKET_NAME=zhe-test
R2_TEST_PUBLIC_DOMAIN=https://test-r2.zhe.to

# 测试 KV（可选）
KV_TEST_NAMESPACE_ID=xxx
```

---

## 八、覆盖率分析与优化空间

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
| P0 | 添加 `ideas.spec.ts` Playwright 测试 | +8-10 L3 |
| P0 | 添加 `api-keys.spec.ts` Playwright 测试 | +6-8 L3 |
| P1 | 提升 `storage.ts` 分支覆盖至 90%+ | +3-5 L1 |
| P1 | 添加 `api-keys.test.ts` 集成测试 | +8-10 L1 |
| P2 | Slider 组件边界测试 | +4-6 L1 |

---

## 九、相关文档

- [架构概览](01-architecture.md)
- [开发规范](07-contributing.md)
- [质量体系升级设计](13-quality-system-upgrade.md)
- [Cloudflare 资源清单与测试隔离](14-cloudflare-resource-inventory.md)
- [E2E 覆盖分析](09-e2e-coverage-analysis.md)
