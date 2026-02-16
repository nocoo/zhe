# 功能详解

本文档描述 Zhe 的主要功能及其实现方式。

> 返回 [README](../README.md)

## 短链接管理

### 创建链接

支持两种模式：

- **简单模式** — 系统自动生成 6 位随机 slug（使用 nanoid，排除易混淆字符 `0OlI`）
- **自定义模式** — 用户指定 slug（自动清理：去空格、转小写、校验格式和保留路径）

创建时自动 fire-and-forget 抓取目标 URL 的元数据（标题、描述、favicon），不阻塞链接创建。

### Slug 生成规则

- 字符集：`123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz`
- 默认长度：6 位
- 碰撞重试：最多 3 次
- 格式限制：1-50 字符，仅限字母数字、连字符、下划线
- 保留路径：`login`, `dashboard`, `api`, `admin` 等不可用作 slug

### 链接操作

| 操作 | 说明 |
|------|------|
| 复制 | 复制短链接到剪贴板 |
| 编辑 | 修改原始 URL、文件夹、过期时间 |
| 删除 | 删除链接及其分析数据 |
| 刷新元数据 | 手动重新抓取标题、描述、favicon |

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

超时设置：5 秒。抓取失败不影响链接正常使用。

## 短链接重定向

中间件（Edge Runtime）处理所有短链接请求：

1. 接收请求 → 提取 slug
2. 查询 D1 数据库
3. 命中且未过期 → **307 临时重定向**
4. 同时异步记录点击分析（`event.waitUntil()`，不阻塞重定向）
5. 未命中或已过期 → 404 页面

## 访问分析

每次短链接被访问时，中间件会解析以下信息并记录：

| 维度 | 解析方式 |
|------|----------|
| 设备类型 | User-Agent 解析（mobile / tablet / desktop） |
| 浏览器 | UA 解析（Chrome, Safari, Firefox, Edge 等） |
| 操作系统 | UA 解析（iOS, Android, Windows, macOS 等） |
| 国家/城市 | Vercel Geo Headers（`x-vercel-ip-country`, `x-vercel-ip-city`） |
| 来源页面 | `Referer` 请求头 |

Dashboard 中展示汇总统计：总点击数、访问国家数、设备/浏览器/操作系统分布。

## 文件夹管理

- 单层扁平结构（不支持嵌套）
- 每个文件夹可设置图标（24 个 Lucide 图标可选）
- 删除文件夹时，关联链接的 `folderId` 自动置空（不删除链接）
- 文件夹名称校验：非空、去前后空格

## 文件上传

通过 S3 兼容存储（Cloudflare R2）分享文件：

| 约束 | 值 |
|------|-----|
| 最大文件大小 | 10 MB |
| 支持格式 | 图片、PDF、文本等常见类型 |
| 上传方式 | 客户端直传（预签名 URL，5 分钟有效期） |
| 文件路径 | `{userHash}/YYYYMMDD/{uuid}.{ext}` |

上传流程：
1. 客户端请求预签名 URL
2. 客户端直接 PUT 到 R2
3. 上传成功后记录元数据到 D1
4. 返回公开访问 URL

## 认证与授权

- **认证方式**：Google OAuth（Auth.js v5 beta）
- **会话策略**：D1 可用时使用数据库会话，否则回退到 JWT
- **授权检查**：所有 Server Actions 和 Dashboard 路由要求登录
- **登录页面**：根路径 `/` 兼作登录页，已登录用户自动跳转 Dashboard

## 主题切换

三态循环切换：`系统` → `浅色` → `深色` → `系统`

基于 `next-themes`，登录页和 Dashboard 头部均提供切换按钮。Logo 和侧边栏图标自动跟随主题。

## 搜索

Dashboard 内置 Command Palette（`Cmd+K` / `Ctrl+K`）：

- 搜索所有链接（按 slug 和原始 URL 过滤）
- 快捷操作：跳转到文件夹、复制短链接

## 相关文档

- [架构概览](01-architecture.md)
- [数据库设计](04-database.md)
- [测试策略](05-testing.md)
