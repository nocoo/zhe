# 远程备份（Backy 集成）

Zhe 集成了 [Backy](https://github.com/kang-makes/backy) 远程备份服务，支持**双向通讯**：既可以从 Zhe 主动推送备份到 Backy（Push），也可以由 Backy 调用 Zhe 暴露的 Webhook 触发备份（Pull）。

> 返回 [README](../README.md)

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                       双向备份通讯                            │
│                                                             │
│   ┌──────────┐     Push (主动推送)      ┌──────────┐       │
│   │          │ ──────────────────────►  │          │       │
│   │   Zhe    │                          │  Backy   │       │
│   │  (本应用) │ ◄──────────────────────  │  (备份)   │       │
│   │          │     Pull (被动触发)       │          │       │
│   └──────────┘                          └──────────┘       │
│                                                             │
│   Push: Zhe 导出数据 → multipart/form-data POST → Backy    │
│   Pull: Backy 调用 Webhook → Zhe 自动执行 Push → Backy     │
└─────────────────────────────────────────────────────────────┘
```

## 功能说明

### Push（主动推送）

用户在 Dashboard 配置 Backy 的 Webhook URL 和 API Key 后，可以手动或自动将全量数据备份推送到 Backy 远程存储。

**备份内容：**

| 数据类型 | 说明 |
|----------|------|
| 链接 | 所有短链接及其元数据（slug、原始 URL、点击数、过期时间等） |
| 文件夹 | 文件夹名称、图标、创建时间 |
| 标签 | 标签名称、颜色、创建时间 |
| 链接-标签关联 | 链接与标签的多对多关系 |

**协议细节：**

| 操作 | HTTP 方法 | 用途 |
|------|-----------|------|
| 测试连接 | `HEAD {webhookUrl}` | 验证 Backy 服务可达，`Authorization: Bearer {apiKey}` |
| 查看历史 | `GET {webhookUrl}` | 获取备份历史记录列表 |
| 推送备份 | `POST {webhookUrl}` | 上传备份文件（multipart/form-data） |

**推送请求格式（multipart/form-data）：**

| 字段 | 类型 | 示例值 |
|------|------|--------|
| `file` | File (JSON) | `zhe-backup-2026-03-02.json` |
| `environment` | String | `prod` 或 `dev`（取决于 `NODE_ENV`） |
| `tag` | String | `v1.5.0-2026-03-02-42lnk-3fld-5tag` |

**Tag 格式规则：**

```
v{version}-{date}-{links}lnk-{folders}fld-{tags}tag
```

例如：`v1.5.0-2026-03-02-42lnk-3fld-5tag` 表示应用版本 1.5.0，包含 42 个链接、3 个文件夹、5 个标签。

### Pull（被动触发）

Zhe 暴露了一个 Webhook 端点 `POST /api/backy/pull`，供 Backy 主动调用。当 Backy 调用此端点时，Zhe 会自动执行一次完整的 Push 流程，实现由 Backy 端发起的定时自动备份。

**认证方式：** 通过 `X-Webhook-Key` 请求头传递预生成的 Key。

**端点说明：**

| 方法 | 端点 | 用途 |
|------|------|------|
| `HEAD /api/backy/pull` | 连接测试 | 验证 Key 有效性，返回 200 或 401 |
| `POST /api/backy/pull` | 触发备份 | 自动收集数据并推送到配置的 Backy 服务 |

**Pull 触发流程：**

1. Backy 发送 `POST /api/backy/pull`，附带 `X-Webhook-Key` 头
2. Zhe 验证 Key → 查找对应用户 → 读取该用户的 Backy Push 配置
3. 自动收集该用户的所有数据（链接、文件夹、标签、关联）
4. 构建备份包 → 推送到用户配置的 Backy Webhook URL
5. 返回推送结果（含统计信息和备份历史）

**调用示例：**

```bash
# 测试连接
curl -I -X HEAD https://zhe.to/api/backy/pull \
  -H "X-Webhook-Key: your-webhook-key"

# 触发备份
curl -X POST https://zhe.to/api/backy/pull \
  -H "X-Webhook-Key: your-webhook-key"
```

**成功响应示例：**

```json
{
  "ok": true,
  "message": "Backup pushed successfully (1234ms)",
  "durationMs": 1234,
  "tag": "v1.5.0-2026-03-02-42lnk-3fld-5tag",
  "fileName": "zhe-backup-2026-03-02.json",
  "stats": {
    "links": 42,
    "folders": 3,
    "tags": 5,
    "linkTags": 18
  },
  "history": {
    "project_name": "zhe",
    "total_backups": 10,
    "recent_backups": [...]
  }
}
```

**错误响应：**

| 状态码 | 原因 |
|--------|------|
| 401 | 缺少 `X-Webhook-Key` 头，或 Key 无效 |
| 422 | 用户尚未配置 Backy Push 设置（Webhook URL / API Key） |
| 502 | 向 Backy 推送备份时失败 |

## 使用指南

### 第一步：配置 Push（主动推送）

1. 进入 Dashboard → 侧边栏 → **备份**
2. 在「远程备份」卡片中填写：
   - **Webhook URL**：Backy 服务提供的备份接收地址
   - **API Key**：Backy 服务的认证密钥
3. 点击「保存」
4. 点击「测试连接」确认配置正确
5. 点击「推送备份」执行首次备份

### 第二步：配置 Pull（被动触发）

1. 在「拉取 Webhook」卡片中，点击「生成凭证」
2. 系统会生成一个 Webhook Key
3. 复制 **Webhook URL**（`https://zhe.to/api/backy/pull`）和 **Key**
4. 在 Backy 端配置定时任务，定期调用此 Webhook

> **注意**：Pull 依赖 Push 配置。使用 Pull 前必须先完成 Push 配置（Webhook URL + API Key），否则 Pull 会返回 422 错误。

### Key 管理

| 操作 | 说明 |
|------|------|
| 生成凭证 | 首次生成 Webhook Key |
| 重新生成 | 作废旧 Key，生成新 Key（需同步更新 Backy 端配置） |
| 撤销 | 删除 Key，停止 Pull 功能 |

## 备份数据格式

备份文件为 JSON 格式的 `BackupEnvelope`：

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-03-02T10:30:00.000Z",
  "links": [
    {
      "slug": "abc123",
      "url": "https://example.com",
      "clicks": 42,
      "title": "Example",
      "description": "An example site",
      "favicon": "https://example.com/favicon.ico",
      "expiresAt": null,
      "folderId": "folder-id",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "folders": [
    {
      "id": "folder-id",
      "name": "My Folder",
      "icon": "folder",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "tags": [
    {
      "id": "tag-id",
      "name": "important",
      "color": "#ff0000",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "linkTags": [
    {
      "linkId": "link-id",
      "tagId": "tag-id"
    }
  ]
}
```

## 数据库字段

Backy 相关数据存储在 `user_settings` 表中：

| 字段 | 用途 |
|------|------|
| `backy_webhook_url` | Push 目标 Backy 服务的 Webhook URL |
| `backy_api_key` | Push 认证用的 API Key |
| `backy_pull_key` | Pull Webhook 的认证 Key |

## 代码结构

| 文件 | 职责 |
|------|------|
| `models/backy.ts` | 纯业务逻辑：类型定义、校验、格式化工具函数 |
| `models/backy.server.ts` | 服务端专用：Pull Key 生成 |
| `actions/backy.ts` | Server Actions：配置 CRUD、连接测试、推送、Pull Webhook 管理 |
| `app/api/backy/pull/route.ts` | API 路由：Pull Webhook 端点（POST + HEAD） |
| `components/dashboard/backy-page.tsx` | UI 组件：远程备份 + Pull Webhook 两张卡片 |
| `viewmodels/useBackyViewModel.ts` | 客户端状态管理：配置、推送、历史、Pull Key 生命周期 |
| `lib/db/scoped.ts` | 数据库操作：Backy 设置和 Pull Key 的 CRUD |

## 相关文档

- [功能详解](03-features.md)
- [数据库设计](04-database.md)
- [架构概览](01-architecture.md)
