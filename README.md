<p align="center">
  <img src="public/logo-light-80.png" alt="Zhe Logo" width="80" height="80">
</p>

<h1 align="center">Zhe</h1>

<p align="center">
  <strong>极简短链接服务</strong><br>
  自部署 · 边缘运行 · 隐私优先
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/Cloudflare_D1-edge-orange" alt="Cloudflare D1">
  <img src="https://img.shields.io/badge/coverage-97%25-brightgreen" alt="Coverage">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

---

## ✨ 功能特点

- 🔗 **短链接管理** — 创建、编辑、删除短链接，支持自定义 slug
- 📊 **访问分析** — 实时追踪点击量、来源、设备等统计数据
- 🧠 **元数据自动抓取** — 创建链接时自动获取标题、描述、favicon
- 📁 **文件夹整理** — 通过文件夹分类管理链接
- 📤 **文件上传** — 通过 S3 兼容存储分享文件，生成短链接
- 🔍 **快捷搜索** — `Cmd+K` 全局搜索链接和文件夹
- 🌗 **深色模式** — 自动跟随系统主题切换
- 🔒 **Google OAuth** — 安全的身份认证，仅授权用户可管理
- ⚡ **边缘部署** — 基于 Cloudflare D1，全球低延迟访问

## 🚀 快速开始

### 1️⃣ 安装依赖

```bash
bun install
```

### 2️⃣ 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`，配置必要的环境变量（详见 [环境搭建文档](docs/02-getting-started.md)）。

### 3️⃣ 启动开发服务器

```bash
bun dev
```

访问 👉 [http://localhost:7005](http://localhost:7005)

### 4️⃣ 运行测试

```bash
npx vitest run          # 全部测试
bun run test:coverage   # 覆盖率报告
```

## 🛠️ 技术栈

| 组件 | 选型 |
|------|------|
| ⚡ 运行时 | [Bun](https://bun.sh) |
| 🖥️ 框架 | [Next.js 15](https://nextjs.org)（App Router） |
| 📝 语言 | TypeScript（strict mode） |
| 🗄️ 数据库 | [Cloudflare D1](https://developers.cloudflare.com/d1/) + [Drizzle ORM](https://orm.drizzle.team) |
| 🎨 UI | [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| 🔐 认证 | [Auth.js v5](https://authjs.dev)（Google OAuth） |
| 📦 存储 | Cloudflare R2（S3 兼容，文件上传） |
| 🧪 测试 | [Vitest](https://vitest.dev) + [React Testing Library](https://testing-library.com) |

## 📋 常用命令

| 命令 | 说明 |
|------|------|
| `bun dev` | 启动开发服务器（端口 7005） |
| `bun run build` | 生产构建 |
| `bun run lint` | ESLint 检查（零警告策略） |
| `npx vitest run` | 运行全部测试 |
| `bun run test:coverage` | 覆盖率报告 |

## 📚 文档目录

| 文档 | 内容 |
|------|------|
| [架构概览](docs/01-architecture.md) | 分层设计、数据流、核心设计模式 |
| [环境搭建](docs/02-getting-started.md) | 安装依赖、环境变量、启动开发 |
| [功能详解](docs/03-features.md) | 短链接、元数据抓取、文件上传、分析等 |
| [数据库设计](docs/04-database.md) | Schema、ScopedDB、迁移管理 |
| [测试策略](docs/05-testing.md) | 覆盖率目标、Mock 策略、TDD 流程 |
| [部署配置](docs/06-deployment.md) | Vercel、D1、安全头、域名 |
| [开发规范](docs/07-contributing.md) | Commit 约定、代码质量、文档维护 |

---

## 🤖 Agent 开发指南

> 本节面向 AI 编程助手（Cursor、Claude Code、Copilot 等），帮助快速上手本项目。

### 项目概述

Zhe 是一个基于 Next.js 15 + Cloudflare D1 的极简 URL 缩短服务，部署在 Vercel 上。生产域名为 `zhe.to`。

### 目录结构

```
zhe/
├── actions/        # Server Actions（'use server'）
├── app/            # Next.js App Router 页面
├── components/     # React 组件
│   ├── dashboard/  # Dashboard 页面组件
│   └── ui/         # shadcn/ui 基础组件（自动生成，勿手动修改）
├── contexts/       # React Context（DashboardService）
├── hooks/          # 通用 React Hooks
├── lib/            # 共享工具库
│   ├── db/         # 数据库层（D1 客户端、ScopedDB、Schema）
│   └── r2/         # R2 存储客户端
├── models/         # 纯业务逻辑（无 React 依赖）
├── viewmodels/     # MVVM ViewModel 钩子
├── tests/          # 测试文件
│   ├── unit/       # 单元测试
│   ├── integration/# 集成测试
│   ├── components/ # 组件测试
│   ├── e2e/        # API E2E 测试
│   └── mocks/      # 共享 Mock
├── drizzle/        # 数据库迁移文件
├── docs/           # 项目文档
└── scripts/        # 构建脚本
```

### 架构分层

```
models/ (纯逻辑) → lib/db/ (数据访问) → actions/ (Server Actions)
→ viewmodels/ (ViewModel) → components/ (UI)
```

关键点：
- 运行时使用原生 SQL 查询 D1，**不使用** Drizzle 查询构建器
- `ScopedDB` 类实现代码层行级安全（自动注入 `user_id`）
- `lib/db/index.ts` 处理公开查询（slug 查找）；`lib/db/scoped.ts` 处理鉴权查询

### 开发服务器

```bash
bun dev    # http://localhost:7005
```

### 测试要求

```bash
npx vitest run    # ⚠️ 必须用 npx vitest，不要用 bun test
```

- **覆盖率目标**：语句 ≥ 90%，函数 ≥ 85%，分支 ≥ 80%
- **TDD 流程**：先写测试（红）→ 实现（绿）→ 重构
- **零警告策略**：ESLint `--max-warnings=0`

### 提交要求

- **原子化 Commit**：每个 commit 仅包含一个逻辑变更
- **格式**：`<type>: <description>`（如 `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`）
- 变更后自动提交，无需请求确认
- 每次 commit 后代码必须能通过全部测试

### 文档要求

**更新代码时必须同步更新相关文档。** 文档位于 `docs/` 目录，编号格式 `01-xxx.md`。

### Git Hooks

| Hook | 内容 |
|------|------|
| pre-commit | 单元测试 + lint-staged |
| pre-push | 全量测试 + 全量 ESLint |

### 注意事项

- 使用 `next/image` 的 `<Image>` 组件而非 `<img>`（避免 ESLint 警告）
- `components/ui/` 是 shadcn/ui 自动生成的，不要手动修改
- 元数据抓取使用 `void (async () => { ... })()` 模式（fire-and-forget）
- 测试中 Mock D1 使用内存 SQL 模拟器（见 `tests/setup.ts`）

---

## 📄 License

[MIT](LICENSE) © 2026
