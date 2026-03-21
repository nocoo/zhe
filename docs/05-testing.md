# 测试策略

本文档描述 Zhe 的质量体系（L1+L2+L3+G1+G2）和测试策略。

> 返回 [README](../README.md) | 参考 [质量体系升级设计](13-quality-system-upgrade.md)

## 测试框架

| 工具 | 用途 |
|------|------|
| [Vitest](https://vitest.dev) | 测试运行器（单元、集成、API E2E） |
| [Playwright](https://playwright.dev) | BDD E2E 端到端测试 |
| [React Testing Library](https://testing-library.com) | React 组件测试 |
| [jsdom](https://github.com/jsdom/jsdom) | 浏览器环境模拟 |
| [@vitest/coverage-v8](https://vitest.dev/guide/coverage) | 代码覆盖率 |

> **重要**：必须使用 `npx vitest run` 运行测试，不要使用 `bun test`。因为 Bun 的 vitest 垫片缺少 `vi.mocked` 和 `vi.unstubAllGlobals`。

## 质量体系：三层测试 + 门控 + 安全检查

| 层级 | 名称 | 验证对象 | Hook | 强制性 |
|------|------|----------|------|--------|
| **L1** | Unit/Component + Integration | 纯函数、ViewModel、Hooks、Server Actions | pre-commit (<30s) | ✅ 硬门控 |
| **L2** | API E2E | **真 HTTP 请求**到运行中的 Next.js 服务器 | pre-push (<3min) | ⚠️ Soft gate |
| **L3** | System/E2E | 真实用户端到端流程（Playwright） | CI / on-demand | ✅ 硬门控 |
| **G1** | Static Analysis | 类型检查 (`tsc --noEmit`) + ESLint strict | pre-commit | ✅ 硬门控 |
| **G2** | Security Advisory | Secrets 泄露 (gitleaks) + 依赖漏洞 (osv-scanner) | pre-commit + pre-push | ⚠️ Advisory |

### L2 Soft Gate 说明

L2 测试通过 `scripts/run-api-e2e.ts` 启动独立 Next.js dev server（端口 17005），对真实 Cloudflare D1 测试数据库发送 HTTP 请求。当远程 D1 不可达或凭证缺失时，`run-api-e2e.ts` 会 warn + skip（降级为 advisory），避免基础设施故障阻塞 push。

### G2 Advisory 说明

G2 工具（gitleaks/osv-scanner）未安装时静默跳过并打印安装提示，不阻塞 commit/push。通过 `scripts/ensure-tools.sh` 实现优雅降级。

## 测试目录结构

```
tests/
├── unit/           # L1: 纯函数、逻辑、组件测试 (~2000 测试)
├── components/     # L1: React 组件测试
├── integration/    # L1: Server Actions + Route Handler 集成测试 (in-process, vi.mock)
├── api/            # L2: API 路由真 HTTP E2E 测试
│   └── helpers/
│       ├── http.ts       # fetch wrapper (base URL, common headers)
│       └── seed.ts       # D1 HTTP API seed/teardown utilities
├── playwright/     # L3: Playwright BDD E2E 测试
│   ├── fixtures/          # 自定义 test fixtures
│   ├── helpers/           # D1 数据库辅助函数
│   ├── global-setup.ts     # 插入测试用户到 D1
│   ├── global-teardown.ts  # 清理测试数据
│   ├── *.setup.ts          # 认证 setup（保存 storageState）
│   └── *.spec.ts           # BDD 场景
├── mocks/          # 共享 Mock 数据
│   └── db-storage.ts
└── setup.ts        # 全局测试配置（D1 内存模拟器）
```

## 端口分配

| 端口 | 用途 |
|------|------|
| 7005 | 开发服务器（`bun run dev`） |
| 17005 | L2 API E2E 测试（`run-api-e2e.ts` 自动管理） |
| 27005 | L3 Playwright BDD E2E 测试（`playwright.config.ts` 自动管理） |

## 覆盖率目标

| 维度 | 阈值 | 当前 |
|------|------|------|
| **语句覆盖率** | **≥ 90%** | ~94% |
| **行覆盖率** | **≥ 90%** | ~93% |
| **函数覆盖率** | ≥ 85% | ~90% |
| **分支覆盖率** | ≥ 80% | ~89% |

覆盖率仅由 `test:unit:coverage` 收集（排除 `tests/api/**` 和 `tests/integration/**`），确保指标反映纯 L1 单元测试。

## Vitest 配置

### 主配置（`vitest.config.ts`）

- 环境：`jsdom`
- Setup：`tests/setup.ts`（D1 内存模拟器）
- 用于 L1 单元测试、集成测试

### API E2E 配置（`vitest.api.config.ts`）

- 环境：`node`（不需要 DOM）
- **不加载** `tests/setup.ts`（不注入 D1 内存模拟器）
- 用于 L2 API E2E 测试（真 HTTP）

## Git Hooks 自动验证

### pre-commit (L1 + G1 + G2)

```bash
# L1: Unit tests + coverage gate (≥90%)
bun run test:unit:coverage

# L1: Integration tests (in-process, no coverage collection)
bun run test:integration

# G1: Static analysis
bun run typecheck
bunx lint-staged

# G2: Secrets scanning (advisory)
source "$(dirname "$0")/../scripts/ensure-tools.sh"
if check_tool gitleaks "secrets scanning"; then
  gitleaks protect --staged --no-banner
fi
```

### pre-push (L2 + G2)

```bash
# L2: API E2E tests (real HTTP, soft gate)
bun run test:api

# G2: Dependency vulnerability scanning (advisory)
source "$(dirname "$0")/../scripts/ensure-tools.sh"
if check_tool osv-scanner "dependency audit" && [ -f bun.lock ]; then
  osv-scanner --lockfile=bun.lock
fi
```

### on-demand (L3)

```bash
bun run test:e2e:pw    # Playwright BDD E2E
```

## 测试命令

| 命令 | 层级 | 说明 |
|------|------|------|
| `bun run test` | — | Watch 模式 |
| `bun run test:run` | — | 单次运行（全部测试） |
| `bun run test:unit` | L1 | 仅单元测试（排除 api/ 和 integration/） |
| `bun run test:unit:coverage` | L1 | 单元测试 + 覆盖率门槛检查 |
| `bun run test:integration` | L1 | Server Actions 集成测试 |
| `bun run test:api` | L2 | API E2E 测试（启动 dev server，真 HTTP） |
| `bun run test:coverage` | — | 覆盖率报告 |
| `bun run test:e2e:pw` | L3 | Playwright BDD E2E |
| `bun run test:e2e:pw:ui` | L3 | Playwright UI 模式（调试用） |
| `bun run typecheck` | G1 | TypeScript 类型检查 |
| `bun run lint` | G1 | ESLint strict（零警告） |

## Playwright E2E 测试 (L3)

### 配置（`playwright.config.ts`）

- **端口**：27005（与开发服务器 7005 和 API E2E 17005 完全隔离）
- **服务器**：`PLAYWRIGHT=1 AUTH_URL=http://localhost:27005 bun run next dev --turbopack -p 27005`
- **`reuseExistingServer: false`** — 每次都启动全新实例
- **串行执行**：`fullyParallel: false`, `workers: 1`（避免数据竞争）
- **浏览器**：Chromium（Desktop Chrome）
- **认证**：通过 setup project 认证，保存 `storageState` 供后续测试复用

### 生命周期

1. **global-setup.ts** — 向 D1 插入测试用户
2. **auth.setup.ts** — 通过 CredentialsProvider 登录，保存 session cookie
3. **\*.spec.ts** — 各场景测试（使用已认证的 storageState）
4. **global-teardown.ts** — 清理测试数据

## 相关文档

- [架构概览](01-architecture.md)
- [开发规范](07-contributing.md)
- [质量体系升级设计](13-quality-system-upgrade.md)
