# 架构概览

本文档描述 Zhe 的整体架构设计与数据流。

> 返回 [README](../README.md)

## 架构分层

Zhe 采用 **MVVM（Model-View-ViewModel）** 分层架构，数据从数据库到 UI 逐层流动：

```
Cloudflare D1 / R2
       │
       ▼
lib/db/d1-client.ts ──── D1 HTTP API 底层客户端
       │
       ├──▶ lib/db/index.ts ──── 公开查询（slug 查找、点击记录）
       ├──▶ lib/db/scoped.ts ─── ScopedDB（行级安全，用户数据隔离）
       │
       ▼
actions/*.ts ──────────── Server Actions（认证 + 业务逻辑）
       │
       ▼
contexts/dashboard-service.tsx ── 客户端内存状态管理
       │
       ▼
viewmodels/*.ts ───────── ViewModel 钩子（编排 Actions + UI 状态）
       │
       ▼
components/*.tsx ──────── React UI 组件
       │
       ▼
app/(dashboard)/*.tsx ─── Next.js 页面（薄包装层）
```

## 目录职责

| 目录 | 职责 | 示例 |
|------|------|------|
| `models/` | 纯业务逻辑，无 React/服务端依赖 | `links.ts` — `buildShortUrl()`, `isLinkExpired()` |
| `lib/` | 共享工具库 | `slug.ts`, `analytics.ts`, `metadata.ts`, `constants.ts` |
| `lib/db/` | 数据库访问层 | `d1-client.ts`, `scoped.ts`, `index.ts`, `schema.ts` |
| `actions/` | Server Actions（`'use server'`） | `links.ts`, `folders.ts`, `upload.ts` |
| `contexts/` | React Context 状态管理 | `dashboard-service.tsx` |
| `viewmodels/` | MVVM ViewModel 钩子 | `useLinksViewModel.ts`, `useFoldersViewModel.ts` |
| `components/` | React UI 组件 | `link-card.tsx`, `app-sidebar.tsx` |
| `components/ui/` | shadcn/ui 基础组件（自动生成） | `button.tsx`, `dialog.tsx` |
| `app/` | Next.js App Router 页面与路由 | `page.tsx`, `api/`, `(dashboard)/` |
| `hooks/` | 通用 React 钩子 | `use-mobile.tsx` |

## 核心设计模式

### 1. 行级安全（Row-Level Security）

Cloudflare D1 不支持数据库层面的 RLS，因此通过 `ScopedDB` 类在代码层实现：

- 构造函数接收 `userId`（必填，空值直接抛异常）
- 所有 SQL 查询自动注入 `WHERE user_id = ?`
- 无法绕过所有权检查

### 2. 双数据库访问层

- **`lib/db/index.ts`** — 公开/无鉴权查询：slug 查找（中间件重定向用）、点击记录
- **`lib/db/scoped.ts`** — 用户数据 CRUD：所有需要鉴权的操作

### 3. Fire-and-Forget 元数据抓取

创建链接时，`fetchMetadata()` 异步执行，不阻塞链接创建。使用 `void (async () => { ... })()` 模式。

### 4. 非阻塞分析记录

中间件使用 `event.waitUntil()` 记录点击分析，重定向立即发生，不等待分析完成。

### 5. 预签名上传

文件上传采用客户端直传 R2 的方式：
1. 服务端生成预签名 PUT URL（5 分钟有效期）
2. 客户端直接上传到 R2
3. 上传成功后，服务端记录元数据到 D1

## 中间件路由逻辑

`middleware.ts` 处理所有请求（排除静态资源）：

1. 根路径 `/` → 直接通过
2. 提取第一段路径作为 slug
3. 保留路径（`dashboard`, `api`, `login` 等）→ 直接通过
4. `/dashboard/*` → 检查认证，未登录重定向到首页
5. slug 查找 → 找到且未过期 → 307 重定向 + 异步记录点击
6. 未找到或已过期 → 404 页面

## Server Actions 一览

### 链接管理（`actions/links.ts`）

| Action | 功能 |
|--------|------|
| `createLink(input)` | 创建链接，支持自定义/随机 slug，异步抓取元数据 |
| `getLinks()` | 获取当前用户所有链接 |
| `deleteLink(linkId)` | 删除链接 |
| `updateLink(linkId, data)` | 更新链接（URL、文件夹、过期时间） |
| `getAnalyticsStats(linkId)` | 获取链接的聚合分析数据 |
| `refreshLinkMetadata(linkId)` | 手动刷新链接元数据 |

### 文件夹管理（`actions/folders.ts`）

| Action | 功能 |
|--------|------|
| `getFolders()` | 获取所有文件夹 |
| `createFolder(input)` | 创建文件夹 |
| `updateFolder(id, input)` | 更新文件夹名称/图标 |
| `deleteFolder(id)` | 删除文件夹 |

### 文件上传（`actions/upload.ts`）

| Action | 功能 |
|--------|------|
| `getPresignedUploadUrl(request)` | 生成预签名上传 URL |
| `recordUpload(data)` | 记录上传元数据 |
| `getUploads()` | 获取所有上传记录 |
| `deleteUpload(uploadId)` | 删除上传（R2 + D1） |

## DashboardService

客户端 React Context，提供统一的状态管理：

- **状态**：`links`, `folders`, `loading`, `siteUrl`
- **链接同步**：`handleLinkCreated`, `handleLinkDeleted`, `handleLinkUpdated`
- **文件夹同步**：`handleFolderCreated`, `handleFolderDeleted`（级联清除关联链接的 `folderId`）, `handleFolderUpdated`
- 文件夹通过 SSR 预加载（`initialFolders`），链接在客户端挂载时获取

## 相关文档

- [功能详解](03-features.md)
- [数据库设计](04-database.md)
- [测试策略](05-testing.md)
