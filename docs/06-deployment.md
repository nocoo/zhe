# 部署与配置

本文档描述 Zhe 的生产部署架构和配置细节。

> 返回 [README](../README.md)

## 部署架构

```
用户请求 (zhe.to/abc)
   │
   ▼
Cloudflare CDN
   │
   ▼
zhe-edge Worker (Cloudflare Workers)
   │
   ├── KV 命中 → 307 重定向 + fire-and-forget 分析
   │
   ├── KV 未命中 / 保留路径 → 转发到 Railway Origin
   │                              │
   │                              ▼
   │                         Next.js Middleware
   │                              ├── LRU 缓存命中 → 307 重定向
   │                              ├── LRU 未命中 → D1 查询 → 307 重定向
   │                              └── 保留路径 → Server Actions / API Routes
   │
   ├── Cloudflare D1 (SQLite) ← 数据持久化（HTTP API 访问）
   ├── Cloudflare KV ← 边缘缓存（slug → URL 映射）
   ├── Cloudflare R2 (S3 兼容) ← 文件存储（预签名 URL 直传）
   │
   └── 定时任务 (*/30 * * * *) → POST /api/cron/cleanup → 清理过期临时文件
```

## Railway 配置

Zhe 的 Next.js 应用部署在 [Railway](https://railway.com) 上，使用 Docker 容器运行。

### Dockerfile

三阶段构建，基于 `oven/bun:1`：

| 阶段 | 内容 |
|------|------|
| `deps` | `bun install --frozen-lockfile` 安装依赖 |
| `builder` | `bun run build` 构建 Next.js |
| `runner` | 复制 `.next/standalone`、`.next/static`、`public`，运行 `bun server.js` |

运行时环境变量：

| 变量 | 值 |
|------|-----|
| `NODE_ENV` | `production` |
| `PORT` | `7005` |
| `HOSTNAME` | `0.0.0.0` |

### Next.js 配置

`next.config.ts`：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `output` | `standalone` | Docker 部署所需的独立输出模式 |
| `allowedDevOrigins` | `["zhe.dev.hexly.ai"]` | 开发环境允许的来源 |
| `experimental.serverActions.allowedOrigins` | `["zhe.to"]` | Worker 代理导致 `x-forwarded-host`（`origin.zhe.to`）与浏览器 `Origin`（`zhe.to`）不匹配，需显式信任浏览器域名 |
| Webpack/Turbopack alias | 替换 polyfill 为空模块 | 目标浏览器原生支持所有 polyfill，节省 ~11 KiB |

## Cloudflare Worker (zhe-edge)

独立项目，位于 `worker/` 目录，作为 `zhe.to` 的全透明反向代理。

### Worker 配置

`worker/wrangler.toml`：

| 配置项 | 值 |
|--------|-----|
| Worker 名称 | `zhe-edge` |
| KV 绑定 | `LINKS_KV` |
| 定时任务 | `*/30 * * * *`（每 30 分钟） |
| 兼容日期 | `2025-01-01` |

### Worker Secrets

通过 `wrangler secret put` 设置：

| Secret | 用途 |
|--------|------|
| `ORIGIN_URL` | Railway 后端 URL（如 `https://zhe.to`） |
| `WORKER_SECRET` | 共享密钥，保护 `/api/cron/cleanup` 和 `/api/record-click` 端点 |

### Worker 部署

```bash
cd worker
bun install
bun run deploy    # wrangler deploy
bun run test      # vitest run
bun run dev       # wrangler dev（本地测试）
bun run tail      # wrangler tail（实时日志）
```

### Geo Header 映射

Worker 将 Cloudflare 地理信息头映射为 Vercel 风格头，使 Origin 端的分析代码无需修改：

| Cloudflare 头 | 映射为 | 使用方 |
|----------------|--------|--------|
| `CF-IPCountry` | `x-vercel-ip-country` | `extractClickMetadata()` |
| `request.cf.city` | `x-vercel-ip-city` | `extractClickMetadata()` |

### 透明代理行为

- 保留原始 `Host` 头（不重写）
- 设置 `X-Forwarded-For`、`X-Forwarded-Proto`、`X-Forwarded-Host`、`X-Real-Host`
- 使用 `redirect: 'manual'` 透传 Origin 重定向
- 静态资源直接转发到 Origin

## Cloudflare D1

`wrangler.toml`（根目录）：

| 配置项 | 值 |
|--------|-----|
| 项目名 | `zhe` |
| 数据库名 | `zhe-db` |
| 绑定名 | `DB` |

D1 通过 HTTP REST API 访问（非 Workers 绑定），支持从 Railway 环境读写：

```
POST https://api.cloudflare.com/client/v4/accounts/{id}/d1/database/{id}/query
```

超时设置：5 秒。

## Cloudflare KV

用于边缘短链接缓存。每个条目存储重定向所需的最少数据：

```json
{
  "id": 42,
  "originalUrl": "https://example.com/long-url",
  "expiresAt": 1735689600000
}
```

**同步策略**：写穿透（每次 CRUD 操作内联同步） + 部署时全量同步（安全网）。无定时同步。

## Cloudflare R2

S3 兼容对象存储，用于文件上传和临时文件。通过预签名 URL 实现客户端直传：

- **永久文件**：`{user-hash}/YYYYMMDD/{uuid}.{ext}`
- **临时文件**：`tmp/{uuid}_{timestamp}.{ext}`（1 小时后自动清理）

## 定时任务

| 计划 | 动作 | 用途 |
|------|------|------|
| `*/30 * * * *` | `POST /api/cron/cleanup` | 删除 R2 中过期的临时文件 |

KV 同步不依赖定时任务，而是在每次 mutation 时内联执行。

## 域名

| 域名 | 用途 |
|------|------|
| `zhe.to` | 生产域名（Cloudflare DNS → Worker → Railway） |
| `origin.zhe.to` | Railway 直连（Worker 转发目标） |
| `localhost:7005` | 本地开发 |

## 保留路径

以下路径不可用作短链接 slug（Worker 和中间件均检查）：

```
login, logout, auth, callback, dashboard, api,
admin, live, _next, static, favicon.ico, robots.txt, sitemap.xml
```

Worker 中的 `RESERVED_PATHS` 集合必须与 `lib/constants.ts` 保持同步。

## 环境变量

### 必填

| 变量 | 用途 |
|------|------|
| `AUTH_SECRET` | Auth.js 加密密钥 |
| `AUTH_GOOGLE_ID` | Google OAuth 客户端 ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth 客户端密钥 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 数据库 ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（D1 + KV 访问） |

### 可选（KV 缓存）

| 变量 | 用途 |
|------|------|
| `CLOUDFLARE_KV_NAMESPACE_ID` | KV 命名空间 ID（未配置则跳过 KV 同步） |

### 可选（文件上传）

| 变量 | 用途 |
|------|------|
| `R2_ACCESS_KEY_ID` | S3 兼容存储 Access Key |
| `R2_SECRET_ACCESS_KEY` | S3 兼容存储 Secret Key |
| `R2_ENDPOINT` | S3 兼容端点 URL |
| `R2_BUCKET_NAME` | R2 存储桶名称 |
| `R2_PUBLIC_DOMAIN` | R2 公开访问域名 |
| `R2_USER_HASH_SALT` | 用户 ID 哈希盐值（文件夹隔离） |

### 可选（安全）

| 变量 | 用途 |
|------|------|
| `WORKER_SECRET` | Worker 共享密钥（保护 cron 和 record-click 端点） |

## 相关文档

- [环境搭建与运行](02-getting-started.md)
- [架构概览](01-architecture.md)
- [数据库设计](04-database.md)
