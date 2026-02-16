# 测试策略

本文档描述 Zhe 的测试体系、覆盖率目标和 Mock 策略。

> 返回 [README](../README.md)

## 测试框架

| 工具 | 用途 |
|------|------|
| [Vitest](https://vitest.dev) | 测试运行器（单元、集成、E2E） |
| [React Testing Library](https://testing-library.com) | React 组件测试 |
| [jsdom](https://github.com/jsdom/jsdom) | 浏览器环境模拟 |
| [@vitest/coverage-v8](https://vitest.dev/guide/coverage) | 代码覆盖率 |

> **重要**：必须使用 `npx vitest run` 运行测试，不要使用 `bun test`。因为 Bun 的 vitest 垫片缺少 `vi.mocked` 和 `vi.unstubAllGlobals`。

## 测试目录结构

```
tests/
├── unit/           # 纯函数和逻辑测试
├── integration/    # Server Actions 集成测试
├── components/     # React 组件测试
├── e2e/            # API 路由端到端测试
├── mocks/          # 共享 Mock 数据
│   └── db-storage.ts
└── setup.ts        # 全局测试配置
```

## 覆盖率目标

| 维度 | 阈值 |
|------|------|
| **语句覆盖率** | **≥ 90%** |
| **行覆盖率** | **≥ 90%** |
| **函数覆盖率** | ≥ 85% |
| **分支覆盖率** | ≥ 80% |

当前状态：**97%+ 语句覆盖率，702 个测试全部通过。**

查看覆盖率报告：

```bash
bun run test:coverage
```

## 覆盖率范围

### 包含

- `lib/**` — 工具库（slug、analytics、metadata、constants、utils、db）
- `models/links.ts` — 纯业务逻辑
- `actions/**` — Server Actions
- `middleware.ts` — 中间件路由
- `viewmodels/**` — ViewModel 钩子
- `hooks/**` — 通用钩子
- 关键组件文件

### 排除

- `node_modules/`、`tests/`、配置文件
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
- 覆盖 links、analytics、uploads、folders 所有表
- 支持自增 ID、级联删除等行为

### Mock 数据存储

`tests/mocks/db-storage.ts` 提供：

| 变量 | 类型 | 说明 |
|------|------|------|
| `mockLinks` | `Map<string, Link>` | 按 slug 索引 |
| `mockAnalytics` | `Analytics[]` | 分析记录 |
| `mockUploads` | `Map<number, Upload>` | 按 ID 索引 |
| `mockFolders` | `Map<string, Folder>` | 按 ID 索引 |
| `clearMockStorage()` | 函数 | 重置所有数据 |

### 组件测试 Mock

组件测试通过 `vi.mock()` Mock 以下模块：

- `next/navigation` — `useRouter`, `usePathname`
- `@/viewmodels/*` — ViewModel 返回值
- `@/contexts/*` — DashboardService
- `next-auth/react` — `signIn`, `signOut`

## 测试命令

| 命令 | 说明 |
|------|------|
| `npx vitest run` | 运行全部测试（推荐） |
| `bun run test` | Watch 模式 |
| `bun run test:unit` | 仅单元测试（排除 E2E） |
| `bun run test:e2e` | 仅 E2E 测试 |
| `bun run test:coverage` | 覆盖率报告 |

## Git Hooks 自动验证

| Hook | 阶段 | 运行内容 |
|------|------|----------|
| `pre-commit` | 提交前 | 单元测试 + ESLint（仅暂存文件） |
| `pre-push` | 推送前 | 全量测试（含 E2E）+ 全量 ESLint |

ESLint 采用**零警告策略**（`--max-warnings=0`），任何警告都会导致 Hook 失败。

## TDD 工作流

本项目遵循 TDD 开发流程：

1. **红** — 先写测试，确认测试失败
2. **绿** — 编写最少代码使测试通过
3. **重构** — 清理代码，保持测试通过

每个逻辑变更应该是一个原子化 commit，确保每次 commit 后所有测试通过。

## 相关文档

- [架构概览](01-architecture.md)
- [开发规范](07-contributing.md)
