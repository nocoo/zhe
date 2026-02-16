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
| `verification_tokens` | 复合主键 | 验证令牌 |

### 业务表（4 张）

| 表名 | 主键 | 说明 |
|------|------|------|
| `links` | `id` (integer, 自增) | 短链接 |
| `folders` | `id` (text, UUID) | 文件夹 |
| `analytics` | `id` (integer, 自增) | 点击分析 |
| `uploads` | `id` (integer, 自增) | 文件上传记录 |

## Links 表详细 Schema

```sql
CREATE TABLE links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id   TEXT    REFERENCES folders(id) ON DELETE SET NULL,
  original_url TEXT   NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,
  is_custom   INTEGER DEFAULT 0,
  expires_at  INTEGER,              -- Unix 时间戳，可空
  clicks      INTEGER DEFAULT 0,
  meta_title       TEXT,            -- 页面标题
  meta_description TEXT,            -- 页面描述
  meta_favicon     TEXT,            -- Favicon URL
  created_at  INTEGER NOT NULL      -- Unix 时间戳
);

CREATE INDEX idx_links_slug ON links(slug);
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
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_analytics_link_id ON analytics(link_id);
```

## Folders 表

```sql
CREATE TABLE folders (
  id         TEXT    PRIMARY KEY,   -- UUID
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  icon       TEXT    DEFAULT 'folder',
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

## ScopedDB 方法

`ScopedDB` 类封装所有用户数据查询，自动注入 `user_id` 条件：

### 链接

| 方法 | 说明 |
|------|------|
| `getLinks()` | 获取用户所有链接 |
| `getLinkById(id)` | 获取单个链接 |
| `createLink(data)` | 创建链接 |
| `updateLink(id, data)` | 更新链接 |
| `updateLinkMetadata(id, data)` | 更新元数据（标题、描述、favicon） |
| `deleteLink(id)` | 删除链接 |

### 分析

| 方法 | 说明 |
|------|------|
| `getAnalyticsByLinkId(linkId)` | 获取链接的所有分析记录 |
| `getAnalyticsStats(linkId)` | 获取聚合统计（点击数、设备分布等） |

### 文件夹

| 方法 | 说明 |
|------|------|
| `getFolders()` | 获取所有文件夹 |
| `getFolderById(id)` | 获取单个文件夹 |
| `createFolder(data)` | 创建文件夹 |
| `updateFolder(id, data)` | 更新文件夹 |
| `deleteFolder(id)` | 删除文件夹 |

### 上传

| 方法 | 说明 |
|------|------|
| `getUploads()` | 获取所有上传记录 |
| `createUpload(data)` | 记录上传 |
| `deleteUpload(id)` | 删除上传记录 |
| `getUploadKey(id)` | 获取 R2 对象路径（用于删除） |

## 迁移管理

迁移文件存放在 `drizzle/migrations/` 目录：

| 文件 | 内容 |
|------|------|
| `0000_initial.sql` | 初始 Schema（Auth.js 表 + links + analytics） |
| `0001_add_folders.sql` | 添加文件夹表 |
| `0002_add_uploads.sql` | 添加上传表 |
| `0003_add_link_metadata.sql` | 添加链接元数据字段 |

执行迁移参见 [环境搭建与运行](02-getting-started.md)。

## 相关文档

- [架构概览](01-architecture.md)
- [环境搭建与运行](02-getting-started.md)
