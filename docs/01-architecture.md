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
models/*.ts ──────────── 纯业务逻辑（无 React/服务端依赖）
       │
       ▼
actions/*.ts ──────────── Server Actions（认证 + 业务编排）
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

## 三层重定向架构

短链接的解析经过三层缓存，逐层降级：

```
User → Cloudflare CDN → [Layer 1] zhe-edge Worker (KV)
                              │ miss
                              ▼
                         [Layer 2] Next.js Middleware (LRU)
                              │ miss
                              ▼
                         [Layer 3] D1 Database
```

| 层级 | 位置 | 存储 | 延迟 | 行为 |
|------|------|------|------|------|
| L1 KV | Cloudflare Edge | KV 键值对 | ~1ms | 命中 → 307 重定向 + fire-and-forget 分析（`source: 'worker'`）；未命中 → 透传到 origin |
| L2 LRU | Railway Node.js | 进程内 Map（1000 条，60s TTL） | ~0ms | 命中 → 307 重定向 + `waitUntil` 分析（`source: 'origin'`）；未命中 → 降级 D1 |
| L3 D1 | Cloudflare D1 | SQLite HTTP API | ~50ms | 命中 → 缓存到 LRU + 307；未命中 → 缓存 null 到 LRU + 404 |

**KV 同步策略**：
- **行内同步**：每次链接增删改，`kvPutLink()` / `kvDeleteLink()` 通过 KV REST API fire-and-forget 写入（3s 超时）
- **启动全量同步**：`instrumentation.ts` 触发 `performKVSync()`，从 D1 全量覆写 KV（批量最多 10,000 条）
- KV 是缓存而非数据源，短暂不一致可接受（Worker 未命中时自动降级 origin）

## 目录职责

| 目录 | 职责 | 示例 |
|------|------|------|
| `models/` | 纯业务逻辑，无 React/服务端依赖（15 个模块） | `links.ts`, `tags.ts`, `xray.ts` |
| `lib/` | 共享工具库 | `slug.ts`, `analytics.ts`, `metadata.ts`, `constants.ts` |
| `lib/db/` | 数据库访问层 | `d1-client.ts`, `scoped.ts`, `index.ts`, `schema.ts` |
| `lib/kv/` | Cloudflare KV 缓存层 | `client.ts`（HTTP REST）, `sync.ts`（全量同步） |
| `actions/` | Server Actions（`'use server'`，13 个模块） | `links.ts`, `tags.ts`, `backy.ts`, `xray.ts` |
| `contexts/` | React Context 状态管理 | `dashboard-service.tsx` |
| `viewmodels/` | MVVM ViewModel 钩子（11 个模块） | `useLinksViewModel.ts`, `useXrayViewModel.ts` |
| `components/` | React UI 组件 | `link-card.tsx`, `app-sidebar.tsx` |
| `components/ui/` | shadcn/ui 基础组件（自动生成） | `button.tsx`, `dialog.tsx` |
| `app/` | Next.js App Router 页面与路由 | `page.tsx`, `api/`, `(dashboard)/` |
| `hooks/` | 通用 React 钩子 | `use-mobile.tsx` |
| `worker/` | Cloudflare Worker 边缘代理 | `src/index.ts`, `wrangler.toml` |
| `drizzle/` | 数据库迁移文件 | `migrations/0000-0016` |
| `docs/` | 项目文档（11 篇） | `01-architecture.md` ~ `11-four-layer-test-plan.md` |
| `tests/` | 测试套件 | `unit/`, `api/`, `e2e/` |

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

创建链接时，`enrichLink()` 异步执行，不阻塞链接创建。根据 URL 类型自动选择enrichment策略：
- **Twitter/X 链接** → xray API 策略（截图 + 推文缓存）
- **其他链接** → 默认 HTML 元数据抓取

### 4. 非阻塞分析记录

中间件使用 `event.waitUntil()` 记录点击分析，重定向立即发生，不等待分析完成。Worker 同样使用 `ctx.waitUntil()` fire-and-forget 发送 `/api/record-click`。

### 5. 预签名上传

文件上传采用客户端直传 R2 的方式：
1. 服务端生成预签名 PUT URL（5 分钟有效期）
2. 客户端直接上传到 R2（支持 PNG → JPEG 自动转换）
3. 上传成功后，服务端记录元数据到 D1

## 中间件路由逻辑

`middleware.ts` 处理所有请求（排除静态资源）：

1. 根路径 `/` → 直接通过
2. 提取第一段路径作为 slug
3. 保留路径（`login`, `dashboard`, `api` 等 13 个）→ 直接通过
4. `/dashboard/*` → 检查认证，未登录重定向到 `/?callbackUrl=<path>`
5. LRU 缓存命中 → 307 重定向 + 异步记录点击
6. LRU 未命中 → D1 查询 → 缓存结果 → 307 或 404
7. 未找到或已过期 → rewrite 到 `/not-found`

**保留路径**（定义在 `lib/constants.ts`，Worker 中手动同步）：
`login`, `logout`, `auth`, `callback`, `dashboard`, `api`, `admin`, `live`, `_next`, `static`, `favicon.ico`, `robots.txt`, `sitemap.xml`

## Models 一览（15 个模块）

| 模块 | 职责 |
|------|------|
| `models/links.ts` | URL 格式化、过滤、搜索高亮、过期检查、域名检测（Twitter/GitHub）、截图获取 |
| `models/folders.ts` | 文件夹名验证、可用 Lucide 图标常量 |
| `models/tags.ts` | 24 色标签系统、FNV-1a 哈希确定性分色、CSS 变量映射、样式生成 |
| `models/upload.ts` | 文件校验、R2 key 生成、预签名 URL 构建、PNG→JPEG 转换、MIME 检测 |
| `models/webhook.ts` | Payload 验证、滑动窗口限流、OpenAPI 3.1 spec 生成、AI agent prompt |
| `models/webhook.server.ts` | 服务端 webhook token 生成（`crypto.randomUUID()`） |
| `models/enrichment.ts` | 可插拔 enrichment 策略接口（`LinkEnrichmentStrategy`） |
| `models/settings.ts` | 预览样式配置、数据导入导出序列化/反序列化 |
| `models/storage.ts` | R2 存储审计：对比 D1 引用 → 识别孤立文件、计算存储摘要 |
| `models/overview.ts` | 概览统计：点击/上传趋势聚合、文件类型分布、Worker 健康度 |
| `models/backy.ts` | Backy 远程备份：配置验证、API key 掩码、标签构建 |
| `models/backy.server.ts` | 服务端 pull webhook key 生成（`crypto.randomUUID()`） |
| `models/xray.ts` | Twitter/X 集成：推文 ID 提取、媒体/图片解析、API URL 构建、mock 数据 |
| `models/tmp-storage.ts` | 临时文件：`tmp/` 前缀命名、时间戳提取、过期检测 |
| `models/types.ts` | 共享类型：`Link`, `Folder`, `Tag`, `LinkTag`, `UserSettings`, `AnalyticsStats` |

## Server Actions 一览（13 个模块）

### 链接管理（`actions/links.ts`）

| Action | 功能 |
|--------|------|
| `createLink(input)` | 创建链接，支持自定义/随机 slug，异步 enrichment + KV 同步 |
| `getLinks()` | 获取当前用户所有链接 |
| `deleteLink(linkId)` | 删除链接 + KV 同步 |
| `updateLink(linkId, data)` | 更新链接（URL、文件夹、过期时间）+ KV 同步 |
| `getAnalyticsStats(linkId)` | 获取链接的聚合分析数据 |
| `refreshLinkMetadata(linkId)` | 手动刷新链接元数据 |

### 文件夹管理（`actions/folders.ts`）

| Action | 功能 |
|--------|------|
| `getFolders()` | 获取所有文件夹 |
| `createFolder(input)` | 创建文件夹 |
| `updateFolder(id, input)` | 更新文件夹名称/图标 |
| `deleteFolder(id)` | 删除文件夹 |

### 标签管理（`actions/tags.ts`）

| Action | 功能 |
|--------|------|
| `getTags()` | 获取所有标签 |
| `createTag(input)` | 创建标签（可选颜色，缺省随机） |
| `updateTag(id, input)` | 更新标签名称/颜色 |
| `deleteTag(id)` | 删除标签 |
| `getLinkTags()` | 获取所有链接-标签关联 |
| `addTagToLink(linkId, tagId)` | 为链接添加标签 |
| `removeTagFromLink(linkId, tagId)` | 移除链接标签 |

### 文件上传（`actions/upload.ts`）

| Action | 功能 |
|--------|------|
| `getPresignedUploadUrl(request)` | 生成预签名上传 URL |
| `recordUpload(data)` | 记录上传元数据 |
| `getUploads()` | 获取所有上传记录 |
| `deleteUpload(uploadId)` | 删除上传（R2 + D1） |

### Webhook（`actions/webhook.ts`）

| Action | 功能 |
|--------|------|
| `getWebhookToken()` | 获取当前 webhook token + 限流配置 |
| `createWebhookToken()` | 生成新 token（替换旧 token） |
| `revokeWebhookToken()` | 撤销 token |
| `updateWebhookRateLimit(value)` | 更新限流阈值（1-10） |

### Enrichment（`actions/enrichment.ts`）

| Action | 功能 |
|--------|------|
| `enrichLink(url, linkId, userId)` | 链接创建时 fire-and-forget enrichment（策略模式：Twitter → xray，其他 → HTML 抓取） |
| `refreshLinkEnrichment(url, linkId, userId)` | 强制刷新 enrichment |

### 设置（`actions/settings.ts`）

| Action | 功能 |
|--------|------|
| `importLinks(payload)` | 导入链接（JSON），跳过重复 slug，同步 KV |
| `exportLinks()` | 导出所有链接为 JSON |
| `getPreviewStyle()` | 获取预览样式设置（默认 `'favicon'`） |
| `updatePreviewStyle(value)` | 更新预览样式 |

### 存储审计（`actions/storage.ts`）

| Action | 功能 |
|--------|------|
| `scanStorage()` | 扫描 R2 + D1，返回存储统计与孤立文件列表 |
| `cleanupOrphanFiles(keys)` | 删除孤立文件（双重验证，上限 5000） |

### 概览（`actions/overview.ts`）

| Action | 功能 |
|--------|------|
| `getOverviewStats()` | 聚合统计：链接数、点击数、趋势、设备分布、上传趋势、存储量 |

### Dashboard 数据（`actions/dashboard.ts`）

| Action | 功能 |
|--------|------|
| `getDashboardData()` | 一次性获取 links + tags + linkTags（合并 3 次查询为 1 次） |

### Backy 备份（`actions/backy.ts`）

| Action | 功能 |
|--------|------|
| `getBackyConfig()` | 获取 Backy 配置（webhook URL + 脱敏 API key） |
| `saveBackyConfig(config)` | 保存配置 |
| `testBackyConnection()` | 测试连接（HEAD 请求） |
| `fetchBackyHistory()` | 获取备份历史 |
| `pushBackup()` | 推送备份（multipart/form-data） |
| `getBackyPullWebhook()` | 获取 pull webhook key |
| `generateBackyPullWebhook()` | 生成 pull webhook key |
| `revokeBackyPullWebhook()` | 撤销 pull webhook key |

### Xray（`actions/xray.ts`）

| Action | 功能 |
|--------|------|
| `getXrayConfig()` | 获取 xray API 配置（URL + 脱敏 token） |
| `saveXrayConfig(config)` | 保存配置 |
| `fetchTweet(tweetUrl)` | 获取单条推文（API 未配置时返回 mock） |
| `fetchBookmarks()` | 获取 Twitter/X 书签列表 |
| `fetchAndCacheTweet(url, linkId?)` | 获取并缓存推文，可选更新链接元数据 |
| `forceRefreshTweetCache(url, linkId)` | 强制刷新推文缓存 + 链接元数据 |

### Worker 状态（`actions/worker-status.ts`）

| Action | 功能 |
|--------|------|
| `getWorkerHealth()` | 获取 Worker/KV 缓存健康状态（部署后首次加载会自动触发 KV 同步） |

## ViewModels 一览（11 个模块）

| ViewModel | 职责 |
|-----------|------|
| `useLinksViewModel` | 链接卡片交互（复制、删除、分析、元数据刷新、截图获取）、创建弹窗状态、内联编辑 + 标签管理、批量自动刷新 |
| `useFoldersViewModel` | 文件夹 CRUD + dashboard service 同步 + 编辑状态管理 |
| `useLinkMutations` | 共享标签操作钩子：乐观 add/remove/create-and-assign，供 Inbox 和内联编辑器复用 |
| `useInboxViewModel` | 收件箱分拣：过滤未分类链接 + 标签操作委托 |
| `useBackyViewModel` | Backy 远程备份：配置加载/保存、连接测试、推送备份、历史查询、pull webhook 管理 |
| `useXrayViewModel` | Twitter/X 集成：API 配置、推文 ID 提取、推文获取、书签列表、一键书签转短链 |
| `useOverviewViewModel` | 概览统计 + Worker 健康状态（stale-while-revalidate 缓存） |
| `useUploadViewModel` | 完整上传流程：验证 → 预签名 → R2 上传 → 记录 D1；PNG→JPEG 转换、拖放状态 |
| `useWebhookViewModel` | Webhook token 生命周期管理 + 限流调整（乐观更新） |
| `useSettingsViewModel` | JSON 导出（触发浏览器下载）+ JSON 导入（文件解析 → 服务端调用） |
| `useDashboardLayoutViewModel` | 侧边栏折叠/展开、移动端抽屉 + body 滚动锁定 |

## DashboardService

客户端 React Context，提供统一的状态管理。使用双 Context 拆分（state + actions）优化重渲染性能。

### 状态

| 字段 | 类型 | 说明 |
|------|------|------|
| `links` | `Link[]` | 用户所有链接（内存全量集） |
| `folders` | `Folder[]` | 用户所有文件夹（SSR 预加载 `initialFolders`） |
| `tags` | `Tag[]` | 用户所有标签 |
| `linkTags` | `LinkTag[]` | 所有链接-标签关联 |
| `loading` | `boolean` | 初始数据加载中 |
| `siteUrl` | `string` | 站点 origin（`window.location.origin`） |

### 操作

| 方法 | 功能 |
|------|------|
| `handleLinkCreated(link)` | 新链接 prepend 到数组 |
| `handleLinkDeleted(id)` | 按 ID 移除链接 |
| `handleLinkUpdated(link)` | 替换已更新的链接 |
| `refreshLinks()` | 重新从服务端获取全量链接 |
| `handleFolderCreated(folder)` | 新文件夹追加到数组 |
| `handleFolderDeleted(id)` | 按 ID 移除文件夹 + 级联清除关联链接的 `folderId` |
| `handleFolderUpdated(folder)` | 替换已更新的文件夹 |
| `handleTagCreated(tag)` | 新标签追加到数组 |
| `handleTagDeleted(id)` | 按 ID 移除标签 + 级联移除关联 linkTags |
| `handleTagUpdated(tag)` | 替换已更新的标签 |
| `handleLinkTagAdded(linkTag)` | 新关联追加到 linkTags |
| `handleLinkTagRemoved(linkId, tagId)` | 按 `(linkId, tagId)` 移除关联 |

### Hooks

| Hook | 用途 |
|------|------|
| `useDashboardState()` | 仅订阅 state context（不因 actions 变更触发重渲染） |
| `useDashboardActions()` | 仅订阅 actions context（refs 稳定，不触发重渲染） |
| `useDashboardService()` | 同时订阅两者（向下兼容） |

## 相关文档

- [功能详解](03-features.md)
- [数据库设计](04-database.md)
- [测试策略](05-testing.md)
- [部署指南](06-deployment.md)
