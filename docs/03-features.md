# 功能详解

本文档描述 Zhe 的主要功能及其实现方式。

> 返回 [README](../README.md)

## 短链接管理

### 创建链接

支持两种模式：

- **简单模式** — 系统自动生成 6 位随机 slug（使用 nanoid，排除易混淆字符 `0OlI`）
- **自定义模式** — 用户指定 slug（自动清理：去空格、转小写、校验格式和保留路径）

创建时支持可选字段：文件夹、备注、截图 URL、标签。同时自动 fire-and-forget 抓取目标 URL 的元数据（标题、描述、favicon），不阻塞链接创建。

### Slug 生成规则

- 字符集：`123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz`
- 默认长度：6 位
- 碰撞重试：最多 3 次
- 格式限制：1-50 字符，仅限字母数字、连字符、下划线
- 保留路径：`login`, `dashboard`, `api`, `admin` 等不可用作 slug（完整列表见 `lib/constants.ts`）

### 链接操作

| 操作 | 说明 |
|------|------|
| 复制 | 复制短链接到剪贴板 |
| 内联编辑 | 直接修改原始 URL、slug、文件夹、过期时间、截图 URL |
| 备注 | 为链接添加/编辑备注 |
| 标签 | 添加/移除标签 |
| 删除 | 删除链接及其分析数据（级联删除 analytics、link_tags） |
| 刷新元数据 | 手动重新抓取标题、描述、favicon |

### 筛选与排序

Dashboard 链接列表支持多维筛选：

- **文件夹筛选** — 单选，按文件夹过滤链接
- **标签筛选** — 多选，AND 交集逻辑（选中多个标签时，仅显示同时拥有所有选中标签的链接）

## 元数据自动抓取

使用 `url-metadata` 库从目标 URL 抓取：

| 字段 | 来源 | 长度限制 |
|------|------|----------|
| 标题 | `<title>` 或 `og:title` | 512 字符 |
| 描述 | `<meta name="description">` 或 `og:description` | 1024 字符 |
| Favicon | favicons 数组，兜底 `{origin}/favicon.ico` | — |

触发时机：
1. **创建链接时** — 异步抓取，不阻塞
2. **手动刷新** — 用户点击刷新按钮
3. **批量刷新** — 批量重新抓取所有链接的元数据

超时设置：5 秒。抓取失败不影响链接正常使用。

### 富集策略

元数据富集采用策略模式（`actions/enrichment.ts`）：

- **Twitter 策略** — 当 URL 包含 `twitter.com` 或 `x.com` 时，通过 Xray API 获取推文数据并缓存
- **默认策略** — 使用 `url-metadata` 抓取 HTML meta 标签

### 截图获取

链接支持两种截图源（`fetchAndSaveScreenshot`）：

- **Microlink** — 通过 Microlink API 获取网页截图
- **screenshotDomains** — 通过自定义截图服务获取

截图流程：服务端获取 → 上传到 R2 → 更新链接的 `screenshotUrl` 字段。

### 预览样式

用户可在设置中切换链接预览样式（`actions/settings.ts`）：

- `favicon` — 使用网站 favicon 作为预览（默认）
- `screenshot` — 使用截图作为预览

### Webhook OpenAPI 文档

`GET /api/link/create/[token]` 返回包含以下内容的 JSON 响应：

- 用户统计摘要（总链接数、总点击数、最近链接）
- 完整的 OpenAPI 3.1 规范
- AI Agent 即用型 Prompt（`buildAgentPrompt()`）

## 短链接重定向

重定向采用三层缓存架构：

### 第一层：Cloudflare Worker KV（边缘）

```
用户请求 → zhe-edge Worker → KV 查找
  ├─ KV 命中 → 307 重定向 + 异步 POST /api/record-click（source: 'worker'）
  └─ KV 未命中 → 转发至 Railway 源站
```

### 第二层：中间件 LRU 缓存（源站内存）

```
源站收到请求 → 中间件 LRU 缓存查找
  ├─ 缓存命中且未过期 → 307 重定向 + 异步记录（source: 'origin'）
  └─ 缓存未命中 → 查询 D1
```

- LRU 容量：1,000 条
- TTL：60 秒
- 实现：`Map` + 手动 LRU 淘汰

### 第三层：D1 数据库查询

```
D1 查询 → 缓存结果到 LRU
  ├─ 查到且未过期 → 307 重定向 + 异步记录
  ├─ 查到但已过期 → 404
  └─ 未查到 → 404
```

> 点击分析始终通过 `event.waitUntil()` 异步记录，不阻塞重定向响应。

## 访问分析

每次短链接被访问时，记录以下信息：

| 维度 | 解析方式 |
|------|----------|
| 设备类型 | User-Agent 解析（mobile / tablet / desktop） |
| 浏览器 | UA 解析（Chrome, Safari, Firefox, Edge 等） |
| 操作系统 | UA 解析（iOS, Android, Windows, macOS 等） |
| 国家/城市 | 地理位置头（`x-vercel-ip-country`, `x-vercel-ip-city`，由 Worker 映射 Cloudflare geo 头） |
| 来源页面 | `Referer` 请求头 |
| 记录来源 | `source` 字段：`worker`（边缘 KV 命中）/ `origin`（源站 D1 回落） |

### 概览仪表盘

`/dashboard/overview` 提供全局统计：

- **汇总卡片** — 总链接数、总点击数、总上传数、总存储量
- **点击趋势图** — 3 线图（总量 / Worker / Origin），按日期聚合
- **上传趋势图** — 按日期聚合的上传数量
- **Top 链接** — 按点击数排序的链接列表
- **设备/浏览器/OS/文件类型分布** — 饼图
- **KV 缓存状态** — Worker 健康状态、KV key 数量、最近同步时间、Cron 历史

## 标签系统

每个链接可添加多个标签，每个标签可应用于多个链接（多对多关联）：

- **CRUD** — 创建、编辑（名称/颜色）、删除标签
- **颜色方案** — 确定性着色（FNV-1a hash → 24 色调色板），相同名称始终生成相同颜色
- **关联管理** — 在创建链接或内联编辑时选择标签
- **筛选** — Dashboard 列表支持按标签多选过滤

## 文件夹管理

- 单层扁平结构（不支持嵌套）
- 每个文件夹可设置图标（24 个 Lucide 图标可选）
- 删除文件夹时，关联链接的 `folderId` 自动置空（不删除链接）
- 文件夹名称校验：非空、去前后空格

## 收件箱分类（Inbox Triage）

`/dashboard` 默认视图为收件箱，显示未归入任何文件夹的链接：

- 未分类链接以列表形式展示
- 刷新按钮重新加载未分类链接

## 文件上传

通过 S3 兼容存储（Cloudflare R2）分享文件：

| 约束 | 值 |
|------|-----|
| 最大文件大小 | 10 MB |
| 支持格式 | 图片（PNG 自动转 JPEG 压缩）、PDF、文本等常见类型 |
| 上传方式 | 客户端直传（预签名 URL，5 分钟有效期） |
| 文件路径 | `{userHash}/YYYYMMDD/{uuid}.{ext}` |

上传流程：
1. 客户端请求预签名 URL
2. 客户端直接 PUT 到 R2
3. 上传成功后记录元数据到 D1
4. 返回公开访问 URL

### 存储管理

`/dashboard/storage` 提供存储状态概览：

- R2/D1 用量统计
- 孤儿文件检测（R2 中存在但 D1 中无记录的文件）
- 批量清理孤儿文件

## 临时文件上传

通过 Webhook 令牌认证的一次性文件上传 API：

```
POST /api/tmp/upload/[token]
Content-Type: multipart/form-data
```

| 约束 | 值 |
|------|-----|
| 最大文件大小 | 10 MB |
| 存储路径 | `tmp/{uuid}_{timestamp}.{ext}` |
| 自动清理 | Worker cron 每 30 分钟调用 `POST /api/cron/cleanup` 清理 1 小时前的 `tmp/` 文件 |

返回文件的公开访问 URL，适合在 Webhook 中上传截图后创建带截图的短链接。

## Webhook API

> ⚠️ **弃用通知**：Webhook Token API 将于 2026-10-01 停止服务。请迁移到 [API Key 认证的 v1 API](#api-v1推荐)。在 `/dashboard/settings` 的 Webhook 设置中可以一键迁移。

通过令牌认证的 HTTP API，支持外部系统自动创建短链接：

### 创建链接

```
POST /api/link/create/[token]
Content-Type: application/json

{
  "url": "https://example.com",
  "customSlug": "custom-slug", // 可选
  "folder": "工作",           // 可选，按名称匹配文件夹
  "note": "备注"              // 可选
}
```

特性：
- **速率限制** — 默认 5 次/分钟，可配置（1-10）
- **幂等性** — 相同 URL 不会重复创建，返回已有链接
- **HEAD 检测** — `HEAD /api/link/create/[token]` 返回 200 用于健康检查
- **文件夹支持** — 按名称匹配现有文件夹（大小写不敏感），不存在则忽略

### 统计信息

```
GET /api/link/create/[token]
```

返回用户统计摘要（总链接数、总点击数、最近 5 条链接）和 API 文档。

## 数据导入导出

`/dashboard/data-management` 提供数据管理功能：

- **导出** — 将所有链接导出为 JSON 格式
- **导入** — 支持从 JSON 文件导入链接

## Backy 远程备份

`/dashboard/backy` 提供与 [Backy](https://github.com/) 备份服务的集成：

### 推送模式（Push）

- 配置 Backy Webhook URL + API Key
- 手动触发推送，将所有链接数据发送到 Backy 服务
- 连接测试：验证 Webhook URL 和 API Key 是否有效

### 拉取模式（Pull）

- 生成唯一的 Pull Webhook Key
- Backy 服务通过 `POST /api/backy/pull`（`X-Webhook-Key` header 认证）主动拉取链接数据
- Key-only 认证（无需额外 secret）

## Xray Twitter 集成

`/dashboard/xray` 提供 X/Twitter 内容集成：

- **配置** — 设置 Xray API URL 和 Token
- **书签获取** — 从 X/Twitter 获取用户书签列表
- **推文展示** — Masonry 布局展示推文内容和媒体
- **一键创建链接** — 从书签推文快速创建短链接
- **推文缓存** — 缓存推文数据到 `tweet_cache` 表，减少重复 API 调用

## 认证与授权

- **认证方式**：Google OAuth（Auth.js v5）
- **会话策略**：始终使用 JWT（消除每请求 D1 会话查询开销）
- **适配器**：D1Adapter 仅用于 OAuth 用户创建/关联，不用于会话管理
- **授权检查**：所有 Server Actions 和 Dashboard 路由要求登录
- **登录页面**：根路径 `/` 兼作登录页，已登录用户自动跳转 Dashboard

## KV 缓存管理

### 内联同步

每次创建、更新、删除链接时，自动同步到 Cloudflare KV：

- 创建/更新 → `PUT` KV entry（slug → originalUrl）
- 删除 → `DELETE` KV entry

### 全量同步

```
POST /api/cron/sync-kv
```

- 首次访问 Dashboard 时自动触发全量同步（通过 `actions/worker-status.ts`）
- 也可通过 API 手动触发
- 同步策略：全量 D1 → KV 覆写（无 delta 检测，KV 是缓存而非数据源）

### 健康监控

`/api/worker-status` 返回 Worker 健康信息，在 Overview 仪表盘展示：

- KV key 总数
- 最近同步时间
- Cron 执行历史

## 主题切换

三态循环切换：`系统` → `浅色` → `深色` → `系统`

基于 `next-themes`，登录页和 Dashboard 头部均提供切换按钮。Logo 和侧边栏图标自动跟随主题。

## 搜索

Dashboard 内置 Command Palette（`Cmd+K` / `Ctrl+K`）：

- 搜索所有链接（按 slug、原始 URL、标题、描述、备注、标签 6 个维度过滤）
- 显示 favicon 和关键词高亮
- 快捷操作：跳转到文件夹、复制短链接
- 空态提示

## API 路由一览

### Legacy Webhook API（已弃用）

> ⚠️ **弃用通知**：Webhook Token API 将于 2026-10-01 停止服务。请迁移到 API Key 认证的 v1 API。

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/link/create/[token]` | POST | Webhook 创建链接 |
| `/api/link/create/[token]` | GET | Webhook 统计 + API 文档 |
| `/api/link/create/[token]` | HEAD | Webhook 健康检查 |
| `/api/tmp/upload/[token]` | POST | 临时文件上传 |
| `/api/tmp/upload/[token]` | GET | 临时上传 API 使用文档 |
| `/api/tmp/upload/[token]` | HEAD | 临时上传健康检查 |

### API v1（推荐）

使用 API Key 认证的 RESTful API。在 `/dashboard/api-keys` 页面创建和管理 API Key。

#### 认证方式

```
Authorization: Bearer zhe_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### 速率限制

每个 API Key 默认 60 次请求/分钟。超限时返回 `429 Too Many Requests`，`Retry-After` header 指示等待秒数。

#### 作用域

| 作用域 | 说明 |
|--------|------|
| `links:read` | 读取链接列表和详情 |
| `links:write` | 创建、更新、删除链接 |
| `folders:read` | 读取文件夹列表和详情 |
| `folders:write` | 创建、更新、删除文件夹 |
| `tags:read` | 读取标签列表和详情 |
| `tags:write` | 创建、更新、删除标签 |
| `uploads:read` | 读取上传文件列表和详情 |
| `uploads:write` | 删除上传文件 |

#### 端点列表

| 路由 | 方法 | 作用域 | 说明 |
|------|------|--------|------|
| `/api/v1/links` | GET | `links:read` | 获取链接列表 |
| `/api/v1/links` | POST | `links:write` | 创建链接 |
| `/api/v1/links/[id]` | GET | `links:read` | 获取链接详情 |
| `/api/v1/links/[id]` | PATCH | `links:write` | 更新链接 |
| `/api/v1/links/[id]` | DELETE | `links:write` | 删除链接 |
| `/api/v1/folders` | GET | `folders:read` | 获取文件夹列表 |
| `/api/v1/folders` | POST | `folders:write` | 创建文件夹 |
| `/api/v1/folders/[id]` | GET | `folders:read` | 获取文件夹详情 |
| `/api/v1/folders/[id]` | PATCH | `folders:write` | 更新文件夹 |
| `/api/v1/folders/[id]` | DELETE | `folders:write` | 删除文件夹 |
| `/api/v1/tags` | GET | `tags:read` | 获取标签列表 |
| `/api/v1/tags` | POST | `tags:write` | 创建标签 |
| `/api/v1/tags/[id]` | GET | `tags:read` | 获取标签详情 |
| `/api/v1/tags/[id]` | PATCH | `tags:write` | 更新标签 |
| `/api/v1/tags/[id]` | DELETE | `tags:write` | 删除标签 |
| `/api/v1/uploads` | GET | `uploads:read` | 获取上传文件列表 |
| `/api/v1/uploads/[id]` | GET | `uploads:read` | 获取上传文件详情 |
| `/api/v1/uploads/[id]` | DELETE | `uploads:write` | 删除上传文件 |

#### 链接 API 详情

**GET /api/v1/links** — 获取链接列表

查询参数：
- `limit` (number, 1-100, default: 50) — 每页数量
- `offset` (number, default: 0) — 偏移量
- `folder` (string) — 按文件夹 ID 过滤

响应：
```json
{
  "links": [
    {
      "id": 123,
      "slug": "abc123",
      "originalUrl": "https://example.com",
      "title": "Example",
      "description": "An example website",
      "faviconUrl": "https://example.com/favicon.ico",
      "screenshotUrl": null,
      "note": "My note",
      "isCustom": true,
      "clicks": 42,
      "folderId": "folder-id",
      "expiresAt": null,
      "createdAt": "2026-01-15T00:00:00.000Z"
    }
  ],
  "total": 100
}
```

**POST /api/v1/links** — 创建链接

请求体：
```json
{
  "url": "https://example.com",
  "customSlug": "my-link",     // 可选
  "folderId": "folder-id",     // 可选
  "note": "备注",              // 可选
  "expiresAt": "2026-12-31"    // 可选，ISO 8601 格式
}
```

响应 (201)：
```json
{
  "link": {
    "id": 123,
    "slug": "my-link",
    "shortUrl": "https://zhe.to/my-link",
    "originalUrl": "https://example.com"
  }
}
```

**PATCH /api/v1/links/[id]** — 更新链接

请求体（所有字段可选）：
```json
{
  "originalUrl": "https://example.com/new",
  "slug": "new-slug",
  "folderId": "new-folder-id",
  "note": "新备注",
  "expiresAt": "2027-01-01"
}
```

### 内部路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查（返回版本号和状态） |
| `/api/live` | GET | 存活探针（仅返回版本号，无外部依赖检查） |
| `/api/record-click` | POST | Worker 上报点击分析 |
| `/api/lookup` | GET | Slug 查找（Worker KV miss 回退） |
| `/api/worker-status` | GET | Worker 健康状态 |
| `/api/cron/cleanup` | POST | 清理过期临时文件 |
| `/api/cron/sync-kv` | POST | KV 全量同步 |
| `/api/backy/pull` | POST/HEAD | Backy 拉取备份（`X-Webhook-Key` header 认证）/ 连接测试 |
| `/api/auth/*` | * | Auth.js 认证路由 |

## 相关文档

- [架构概览](01-architecture.md)
- [数据库设计](04-database.md)
- [测试策略](05-testing.md)
- [远程备份（Backy 集成）](10-backy.md)
