# 开发规范

本文档描述 Zhe 的代码提交、文档维护和开发约定。

> 返回 [README](../README.md)

## Commit 规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>: <short description>
```

### Type 列表

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: add metadata refresh button` |
| `fix` | Bug 修复 | `fix: handle expired link redirect` |
| `test` | 测试相关 | `test: add scoped-db metadata tests` |
| `docs` | 文档变更 | `docs: update architecture diagram` |
| `refactor` | 重构（不改变行为） | `refactor: extract slug validation` |
| `chore` | 构建/工具/依赖变更 | `chore: add url-metadata dependency` |

### 规则

- 祈使句（`add` 而非 `added`）
- 全小写
- 不超过 50 字符
- 每个 commit 仅包含一个逻辑变更（原子化）
- 变更后自动提交，无需请求确认

## 原子化 Commit 策略

秉持"快速试错，快速修正"的开发哲学：

- 偏好高频、微小的 `fix` 提交
- 严禁混淆功能和修复在同一个 commit 中
- 每次 commit 后代码必须能通过测试且可构建
- 使用 `git revert` 而非 `git reset --hard` 回退

## TDD 工作流

1. **红** — 先写测试，运行确认失败
2. **绿** — 编写最少实现代码使测试通过
3. **重构** — 清理代码，保持测试通过
4. **提交** — 原子化 commit

## 代码质量要求

### 测试覆盖率

| 维度 | 阈值 |
|------|------|
| 语句 / 行 | ≥ 90% |
| 函数 | ≥ 85% |
| 分支 | ≥ 80% |

### ESLint

- 零警告策略（`--max-warnings=0`）
- Pre-commit 检查暂存文件
- Pre-push 全量检查

### Git Hooks（Husky）

| Hook | 运行内容 |
|------|----------|
| `pre-commit` | `bun run test:unit` + `bunx lint-staged` |
| `pre-push` | `bun run test:run` + `bun run lint` |

## 文档维护规则

**更新代码时必须同步更新相关文档。**

文档结构：

```
README.md              — 项目入口（概览 + Agent 指南）
AGENT.md / CLAUDE.md   — 指向 README.md
docs/
├── 01-architecture.md — 架构与数据流
├── 02-getting-started.md — 环境搭建
├── 03-features.md     — 功能详解
├── 04-database.md     — 数据库设计
├── 05-testing.md      — 测试策略
├── 06-deployment.md   — 部署配置
└── 07-contributing.md — 开发规范（本文件）
```

### 文档更新时机

| 变更类型 | 需要更新的文档 |
|----------|----------------|
| 新增功能 | `03-features.md`、`README.md` 功能列表 |
| 数据库变更 | `04-database.md`、迁移文件 |
| 架构变更 | `01-architecture.md` |
| 新增依赖 | `02-getting-started.md` |
| 部署配置变更 | `06-deployment.md` |
| 测试策略变更 | `05-testing.md` |
| 开发流程变更 | `07-contributing.md` |

## 技术栈

| 组件 | 选型 |
|------|------|
| 运行时 | Bun |
| 框架 | Next.js 15（App Router） |
| 语言 | TypeScript（strict mode） |
| 数据库 | Cloudflare D1（Serverless SQLite） |
| ORM | Drizzle ORM（仅 Schema 定义） |
| UI | Tailwind CSS + shadcn/ui |
| 认证 | Auth.js v5（Google OAuth） |
| 存储 | Cloudflare R2（S3 兼容） |
| 测试 | Vitest + React Testing Library |

## 相关文档

- [测试策略](05-testing.md)
- [架构概览](01-architecture.md)
