# 测试策略

本文档描述 Zhe 的测试体系、覆盖率目标和 Mock 策略。

> 返回 [README](../README.md)

## 测试框架

| 工具 | 用途 |
|------|------|
| [Vitest](https://vitest.dev) | 测试运行器（单元、集成、组件、API E2E） |
| [Playwright](https://playwright.dev) | BDD E2E 端到端测试 |
| [React Testing Library](https://testing-library.com) | React 组件测试 |
| [jsdom](https://github.com/jsdom/jsdom) | 浏览器环境模拟 |
| [@vitest/coverage-v8](https://vitest.dev/guide/coverage) | 代码覆盖率 |

> **重要**：必须使用 `npx vitest run` 运行测试，不要使用 `bun test`。因为 Bun 的 vitest 垫片缺少 `vi.mocked` 和 `vi.unstubAllGlobals`。

## 四层测试架构

| 层级 | 名称 | 运行方式 | 触发时机 | 内容 |
|------|------|----------|----------|------|
| L1 | 单元测试 | `bun run test:unit:coverage` | pre-commit | 纯函数、模型、ViewModel、组件（2030 个测试，覆盖率门槛） |
| L2 | Lint | `bunx lint-staged` | pre-commit | ESLint 零警告策略（`--max-warnings=0`），仅暂存文件 |
| L3 | API E2E | `bun run test:api` | pre-push | Vitest API 端到端测试（mock 级别，无端口依赖） |
| L4 | BDD E2E | `bun run test:e2e:pw` | 按需手动 | Playwright 完整 E2E（独立 Next.js 实例，端口 27005） |

## 测试目录结构

```
tests/
├── unit/           # 纯函数和逻辑测试
├── integration/    # Server Actions 集成测试
├── components/     # React 组件测试
├── api/            # API 路由端到端测试（L3）
├── playwright/     # Playwright BDD E2E 测试（L4）
│   ├── fixtures/          # 自定义 test fixtures
│   ├── helpers/           # D1 数据库辅助函数
│   ├── global-setup.ts     # 插入测试用户到 D1
│   ├── global-teardown.ts  # 清理测试数据
│   ├── *.setup.ts          # 认证 setup（保存 storageState）
│   └── *.spec.ts           # BDD 场景
├── mocks/          # 共享 Mock 数据
│   └── db-storage.ts
└── setup.ts        # 全局测试配置
```

## 端口分配

| 端口 | 用途 |
|------|------|
| 7005 | 开发服务器（`bun run dev`） |
| 27005 | Playwright BDD E2E 测试（自动管理） |

> **注意**：L3 API E2E 测试（`tests/api/`）不使用任何端口，直接 import route handler 调用。

## 覆盖率目标

| 维度 | 阈值 | 当前 |
|------|------|------|
| **语句覆盖率** | **≥ 90%** | ~90% |
| **行覆盖率** | **≥ 90%** | ~90% |
| **函数覆盖率** | ≥ 85% | ~87% |
| **分支覆盖率** | ≥ 80% | ~94% |

当前状态：**2030 个测试全部通过，90%+ 语句覆盖率。**

查看覆盖率报告：

```bash
bun run test:coverage
```

## 覆盖率范围

### 包含（`vitest.config.ts`）

- `lib/**/*.ts` — 工具库（slug、analytics、metadata、constants、utils、db、kv）
- `models/links.ts`, `models/backy.ts` — 纯业务逻辑
- `actions/**/*.ts` — Server Actions（13 个模块）
- `middleware.ts` — 中间件路由
- `viewmodels/**/*.ts` — ViewModel 钩子（11 个模块）
- `hooks/**/*.tsx` — 通用钩子
- `components/app-sidebar.tsx`, `components/dashboard-shell.tsx`, `components/theme-toggle.tsx`
- `components/dashboard/**/*.tsx` — Dashboard 组件
- `app/**/page.tsx` — 页面组件

### 排除

- `node_modules/`、`tests/`、配置文件、`.next/`
- `lib/db/schema.ts` — 纯声明文件
- `lib/palette.ts` — 常量文件
- `components/ui/` — shadcn/ui 自动生成组件
- `app/api/auth/**` — Auth.js 路由处理器

## Mock 策略

### D1 内存模拟器

`tests/setup.ts` 中全局 Mock 了 `executeD1Query`，实现了一个**内存 SQL 模拟器**：

- 通过字符串匹配解析 SQL 语句
- 使用 `Map` / `Array` 存储数据
- 支持 INSERT、SELECT、UPDATE、DELETE 操作
- 覆盖 links、analytics、uploads、folders、tags、link_tags 等所有表
- 支持自增 ID、级联删除等行为

### Mock 数据存储

`tests/mocks/db-storage.ts` 提供：

| 变量 | 类型 | 说明 |
|------|------|------|
| `mockLinks` | `Map<string, Link>` | 按 slug 索引 |
| `mockAnalytics` | `Analytics[]` | 分析记录 |
| `mockUploads` | `Map<number, Upload>` | 按 ID 索引 |
| `mockFolders` | `Map<string, Folder>` | 按 ID 索引 |
| `mockWebhooks` | `Map<string, Webhook>` | 按 userId 索引 |
| `mockTags` | `Map<string, Tag>` | 按 ID 索引 |
| `mockLinkTags` | `MockLinkTag[]` | 链接-标签关联 |
| `mockUserSettings` | `Map<string, MockUserSettings>` | 按 userId 索引 |
| `mockTweetCache` | `Map<string, TweetCache>` | 按 tweetId 索引 |
| `clearMockStorage()` | 函数 | 重置所有数据 |

### 组件测试 Mock

组件测试通过 `vi.mock()` Mock 以下模块：

- `next/navigation` — `useRouter`, `usePathname`
- `@/viewmodels/*` — ViewModel 返回值
- `@/contexts/*` — DashboardService
- `next-auth/react` — `signIn`, `signOut`

## Playwright E2E 测试

### 配置（`playwright.config.ts`）

- **端口**：27005（与开发服务器 7005 完全隔离）
- **服务器**：`PLAYWRIGHT=1 AUTH_URL=http://localhost:27005 bun run next dev --turbopack -p 27005`
- **`reuseExistingServer: false`** — 每次都启动全新实例
- **串行执行**：`fullyParallel: false`, `workers: 1`（避免数据竞争）
- **浏览器**：Chromium（Desktop Chrome）
- **认证**：通过 setup project 认证，保存 `storageState` 供后续测试复用

### 环境变量

| 变量 | 值 | 作用 |
|------|------|------|
| `PLAYWRIGHT` | `1` | 激活 `auth.ts` 中的 `e2e-credentials` CredentialsProvider |
| `AUTH_URL` | `http://localhost:27005` | NextAuth 使用非安全 cookie（HTTP localhost） |

### 生命周期

1. **global-setup.ts** — 向 D1 插入测试用户
2. **auth.setup.ts** — 通过 CredentialsProvider 登录，保存 session cookie
3. **\*.spec.ts** — 各场景测试（使用已认证的 storageState）
4. **global-teardown.ts** — 清理测试数据

## 测试命令

| 命令 | 说明 |
|------|------|
| `bun run test` | Watch 模式 |
| `bun run test:run` | 单次运行（全部测试） |
| `bun run test:unit` | 仅单元测试（排除 `tests/api/`） |
| `bun run test:unit:coverage` | 单元测试 + 覆盖率门槛检查 |
| `bun run test:api` | API E2E 测试（L3） |
| `bun run test:coverage` | 覆盖率报告 |
| `bun run test:e2e:pw` | Playwright BDD E2E（L4） |
| `bun run test:e2e:pw:ui` | Playwright UI 模式（调试用） |

## Git Hooks 自动验证

| Hook | 层级 | 运行内容 |
|------|------|----------|
| `pre-commit` | L1 + L2 | `bun run test:unit:coverage` + `bunx lint-staged`（零警告 ESLint） |
| `pre-push` | L3 | `bun run test:api`（API E2E 测试） |
| 按需 | L4 | `bun run test:e2e:pw`（Playwright BDD E2E） |

> **注意**：L4（Playwright BDD E2E）不在 Git Hook 中自动运行，需手动执行。

## TDD 工作流

本项目遵循 TDD 开发流程：

1. **红** — 先写测试，确认测试失败
2. **绿** — 编写最少代码使测试通过
3. **重构** — 清理代码，保持测试通过

每个逻辑变更应该是一个原子化 commit，确保每次 commit 后所有测试通过。

## 相关文档

- [架构概览](01-architecture.md)
- [开发规范](07-contributing.md)
- [四层测试计划](11-four-layer-test-plan.md)
