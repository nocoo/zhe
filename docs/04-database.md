# 数据库设计

本文档描述 Zhe 的数据库 Schema 和迁移管理。

> 返回 [README](../README.md)

## 技术选型

| 项目 | 选择 | 理由 |
|------|------|------|
| 数据库 | Cloudflare D1 | 全球边缘分布，5GB 免费，500 万次/天读取 |
| ORM | Drizzle ORM | 仅用于 Schema 定义和迁移生成 |
| 运行时查询 | 原生 SQL | 通过 D1 HTTP API 直接执行 |
| 安全模型 | 代码层 RLS | `ScopedDB` 类自动注入 `user_id` 条件 |

> **注意**：Drizzle ORM 仅在开发阶段用于 Schema 定义和迁移生成。运行时所有查询都是通过 `lib/db/d1-client.ts` 直接发送原生 SQL。

## 数据表概览

### Auth.js 表（4 张）

| 表名 | 主键 | 说明 |
|------|------|------|
| `users` | `id` (text) | 用户信息 |
| `accounts` | `id` (text) | OAuth 账号关联 |
| `sessions` | `id` (text) | 数据库会话 |
| `verificationTokens` | 复合主键 | 验证令牌 |

### 业务表（9 张）

| 表名 | 主键 | 说明 |
|------|------|------|
| `links` | `id` (integer, 自增) | 短链接 |
| `folders` | `id` (text, UUID) | 文件夹 |
| `analytics` | `id` (integer, 自增) | 点击分析 |
| `uploads` | `id` (integer, 自增) | 文件上传记录 |
| `webhooks` | `id` (integer, 自增) | Webhook API 令牌（每用户一个） |
| `tags` | `id` (text, UUID) | 用户标签 |
| `link_tags` | 复合主键 (`link_id`, `tag_id`) | 链接-标签关联（多对多） |
| `user_settings` | `user_id` (text) | 用户偏好设置 |
| `tweet_cache` | `tweet_id` (text) | X/Twitter 推文缓存（全局共享） |

## Links 表

```sql
CREATE TABLE links (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id        TEXT    REFERENCES folders(id) ON DELETE SET NULL,
  original_url     TEXT    NOT NULL,
  slug             TEXT    NOT NULL UNIQUE,
  is_custom        INTEGER DEFAULT 0,
  expires_at       INTEGER,              -- Unix 时间戳，可空
  clicks           INTEGER DEFAULT 0,
  meta_title       TEXT,                 -- 页面标题
  meta_description TEXT,                 -- 页面描述
  meta_favicon     TEXT,                 -- Favicon URL
  screenshot_url   TEXT,                 -- 页面截图 URL（存于 R2）
  note             TEXT,                 -- 用户备注
  created_at       INTEGER NOT NULL      -- Unix 时间戳
);

CREATE UNIQUE INDEX links_slug_unique ON links(slug);
CREATE INDEX idx_links_user_id ON links(user_id);
```

## Analytics 表

```sql
CREATE TABLE analytics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id    INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  country    TEXT,
  city       TEXT,
  device     TEXT,     -- mobile / tablet / desktop / unknown
  browser    TEXT,     -- Chrome, Safari, Firefox, Edge 等
  os         TEXT,     -- iOS, Android, Windows, macOS 等
  referer    TEXT,
  source     TEXT,     -- 'worker' | 'origin' | null（历史数据）
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_analytics_link_id ON analytics(link_id);
CREATE INDEX idx_analytics_link_created ON analytics(link_id, created_at DESC);
```

> `source` 字段区分点击来源：`worker` 表示由 Cloudflare Worker 边缘记录，`origin` 表示由 Railway 源站记录，`null` 为历史数据。

## Folders 表

```sql
CREATE TABLE folders (
  id         TEXT    PRIMARY KEY,   -- UUID
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  icon       TEXT    NOT NULL DEFAULT 'folder',
  created_at INTEGER NOT NULL
);
```

## Uploads 表

```sql
CREATE TABLE uploads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT    NOT NULL UNIQUE,  -- R2 对象路径
  file_name  TEXT    NOT NULL,
  file_type  TEXT    NOT NULL,
  file_size  INTEGER NOT NULL,
  public_url TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
```

## Webhooks 表

```sql
CREATE TABLE webhooks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,
  rate_limit INTEGER NOT NULL DEFAULT 5,  -- 每分钟请求限制
  created_at INTEGER NOT NULL
);
```

> 每个用户最多一个 Webhook 令牌（`user_id` UNIQUE）。通过 `POST /api/link/create/[token]` 创建短链接。

## Tags 表

```sql
CREATE TABLE tags (
  id         TEXT    PRIMARY KEY,   -- UUID
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  color      TEXT    NOT NULL,      -- 颜色代码
  created_at INTEGER NOT NULL
);
```

## Link Tags 表（关联表）

```sql
CREATE TABLE link_tags (
  link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  tag_id  TEXT    NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (link_id, tag_id)
);
```

> 多对多关联：一个链接可有多个标签，一个标签可应用于多个链接。删除链接或标签时级联清理。

## User Settings 表

```sql
CREATE TABLE user_settings (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preview_style      TEXT NOT NULL DEFAULT 'favicon',  -- 链接预览样式
  backy_webhook_url  TEXT,                              -- Backy 备份 webhook URL
  backy_api_key      TEXT,                              -- Backy API key
  xray_api_url       TEXT,                              -- Xray API 地址
  xray_api_token     TEXT,                              -- Xray API token
  backy_pull_key     TEXT                               -- Backy pull webhook key
);
```

> 用户偏好与第三方集成设置。`preview_style` 控制链接列表中的预览样式（`favicon` / `screenshot`）。

## Tweet Cache 表

```sql
CREATE TABLE tweet_cache (
  tweet_id         TEXT PRIMARY KEY,        -- Twitter snowflake ID
  author_username  TEXT NOT NULL,
  author_name      TEXT NOT NULL,
  author_avatar    TEXT NOT NULL,
  tweet_text       TEXT NOT NULL,
  tweet_url        TEXT NOT NULL,
  lang             TEXT,                    -- 语言代码
  tweet_created_at TEXT NOT NULL,
  raw_data         TEXT NOT NULL,           -- 完整 JSON
  fetched_at       INTEGER NOT NULL,        -- 首次抓取时间
  updated_at       INTEGER NOT NULL         -- 最后更新时间
);
```

> 全局共享的推文缓存，不属于特定用户。通过 Xray API 抓取 X/Twitter 内容并缓存，减少重复请求。

## ScopedDB 方法

`ScopedDB` 类（`lib/db/scoped.ts`）封装所有用户数据查询，自动注入 `user_id` 条件：

### 链接

| 方法 | 说明 |
|------|------|
| `getLinks()` | 获取用户所有链接 |
| `getLinkById(id)` | 获取单个链接 |
| `getLinksByIds(ids)` | 批量获取链接（自动分块，D1 参数限制） |
| `createLink(data)` | 创建链接 |
| `updateLink(id, data)` | 更新链接（URL、文件夹、过期时间、slug、截图） |
| `updateLinkMetadata(id, data)` | 更新元数据（标题、描述、favicon） |
| `updateLinkScreenshot(id, url)` | 更新截图 URL |
| `updateLinkNote(id, note)` | 更新链接备注 |
| `deleteLink(id)` | 删除链接 |

### 分析

| 方法 | 说明 |
|------|------|
| `getAnalyticsByLinkId(linkId)` | 获取链接的所有分析记录（通过 JOIN 校验所有权） |
| `getAnalyticsStats(linkId)` | 获取聚合统计（点击数、设备/浏览器/OS 分布） |

### 文件夹

| 方法 | 说明 |
|------|------|
| `getFolders()` | 获取所有文件夹 |
| `getFolderById(id)` | 获取单个文件夹 |
| `createFolder(data)` | 创建文件夹 |
| `updateFolder(id, data)` | 更新文件夹（名称、图标） |
| `deleteFolder(id)` | 删除文件夹 |

### 上传

| 方法 | 说明 |
|------|------|
| `getUploads()` | 获取所有上传记录 |
| `createUpload(data)` | 记录上传 |
| `deleteUpload(id)` | 删除上传记录 |
| `getUploadKey(id)` | 获取 R2 对象路径（用于删除） |

### 总览

| 方法 | 说明 |
|------|------|
| `getOverviewStats()` | 聚合统计：链接数、点击数、上传数、存储量、趋势图、设备/浏览器/OS/文件类型分布 |

### Webhook

| 方法 | 说明 |
|------|------|
| `getWebhook()` | 获取当前 webhook |
| `upsertWebhook(token)` | 创建或替换 webhook 令牌 |
| `updateWebhookRateLimit(limit)` | 更新速率限制 |
| `deleteWebhook()` | 删除 webhook |

### 标签

| 方法 | 说明 |
|------|------|
| `getTags()` | 获取所有标签 |
| `createTag(data)` | 创建标签（名称 + 颜色） |
| `updateTag(id, data)` | 更新标签（名称、颜色） |
| `deleteTag(id)` | 删除标签（级联清理 link_tags） |

### 链接-标签关联

| 方法 | 说明 |
|------|------|
| `getLinkTags()` | 获取所有链接-标签关联 |
| `addTagToLink(linkId, tagId)` | 添加标签到链接（校验双方所有权） |
| `removeTagFromLink(linkId, tagId)` | 从链接移除标签 |

### 用户设置

| 方法 | 说明 |
|------|------|
| `getUserSettings()` | 获取用户设置 |
| `upsertPreviewStyle(style)` | 更新预览样式 |
| `getBackySettings()` | 获取 Backy 备份配置 |
| `upsertBackySettings(data)` | 保存 Backy webhook URL + API key |
| `getXraySettings()` | 获取 Xray API 配置 |
| `upsertXraySettings(data)` | 保存 Xray API URL + token |
| `getBackyPullWebhook()` | 获取 Backy pull webhook key |
| `upsertBackyPullWebhook(data)` | 保存 Backy pull webhook key |
| `deleteBackyPullWebhook()` | 清除 Backy pull webhook key |

## 非作用域操作（lib/db/index.ts）

以下操作不受用户作用域限制，用于公开 API 和系统操作：

### 链接（公开）

| 方法 | 说明 |
|------|------|
| `getLinkBySlug(slug)` | 通过 slug 查找链接（重定向用） |
| `slugExists(slug)` | 检查 slug 是否已存在 |
| `createLink(data)` | 创建链接（webhook 路由使用） |
| `getLinkByUserAndUrl(userId, url)` | 查找用户已有相同 URL 的链接（幂等性） |
| `getAllLinksForKV()` | 获取所有链接的 KV 同步字段（管理操作） |

### 分析（公开）

| 方法 | 说明 |
|------|------|
| `recordClick(data)` | 记录点击事件并递增链接点击计数 |

### Webhook（公开）

| 方法 | 说明 |
|------|------|
| `getWebhookByToken(token)` | 通过 token 查找 webhook（API 路由认证） |
| `getWebhookStats(userId)` | Webhook 用户的统计摘要（链接数、点击数、近 5 条链接） |
| `getFolderByUserAndName(userId, name)` | 按名称查找文件夹（webhook 路由解析文件夹名） |

### 推文缓存（全局）

| 方法 | 说明 |
|------|------|
| `getTweetCacheById(tweetId)` | 查询单条缓存推文 |
| `upsertTweetCache(data)` | 插入或更新推文缓存 |

### Backy Pull Webhook（公开）

| 方法 | 说明 |
|------|------|
| `verifyBackyPullWebhook(key)` | 验证 Backy pull webhook key 并返回 userId |

## 迁移管理

迁移文件存放在 `drizzle/migrations/` 目录：

| 文件 | 内容 |
|------|------|
| `0000_good_rick_jones.sql` | 初始 Schema（Auth.js 表 + links + analytics + folders） |
| `0001_add_uploads_table.sql` | 添加文件上传表 |
| `0002_add_folder_icon.sql` | 文件夹添加 `icon` 字段 |
| `0003_add_link_metadata.sql` | 链接添加元数据字段（title, description, favicon） |
| `0004_add_webhooks_table.sql` | 添加 Webhook 表 |
| `0005_add_webhook_rate_limit.sql` | Webhook 添加 `rate_limit` 字段 |
| `0006_add_link_screenshot.sql` | 链接添加 `screenshot_url` 字段 |
| `0007_add_tags_and_link_note.sql` | 添加 tags、link_tags 表和链接 `note` 字段 |
| `0008_add_search_indexes.sql` | 添加搜索性能索引 |
| `0009_add_user_settings.sql` | 添加用户设置表 |
| `0010_add_composite_indexes.sql` | 添加复合索引（分析聚合、上传列表） |
| `0011_add_backy_settings.sql` | user_settings 添加 Backy 备份配置字段 |
| `0012_add_xray_settings.sql` | user_settings 添加 Xray API 配置字段 |
| `0013_add_tweet_cache.sql` | 添加推文缓存表 |
| `0014_drop_discord_bot_settings.sql` | 移除 Discord Bot 配置字段 |
| `0015_add_backy_pull_webhook.sql` | user_settings 添加 Backy pull webhook 字段 |
| `0016_drop_backy_pull_secret.sql` | 废弃 backy_pull_secret（改为仅 key 认证） |

执行迁移参见 [环境搭建与运行](02-getting-started.md)。

## 相关文档

- [架构概览](01-architecture.md)
- [环境搭建与运行](02-getting-started.md)
