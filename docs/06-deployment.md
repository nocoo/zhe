# 部署与配置

本文档描述 Zhe 的生产部署架构和配置细节。

> 返回 [README](../README.md)

> The [origin migration](34-jp4-migration.md) is complete: `zhe-app` runs on jp4
> behind Caddy and is published only through `origin.zhe.to`. Docker CD, runtime
> variables and acceptance are governed by the pinned shared workflow.

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
   ├── KV 未命中 / 保留路径 → 转发到源站
   │                              │
   │                              ▼
   │                         origin.zhe.to（Cloudflare → Caddy）
   │                              │
   │                              ▼
   │                         Next.js Middleware
   │                              ├── LRU 缓存命中 → 307 重定向
   │                              ├── LRU 未命中 → D1 查询 → 307 重定向
   │                              └── 保留路径 → Server Actions / API Routes
   │
   ├── Cloudflare D1 (SQLite) ← 数据持久化（经 Worker D1 代理）
   ├── Cloudflare KV ← 边缘缓存（slug → URL 映射）
   ├── Cloudflare R2 (S3 兼容) ← 文件存储（预签名 URL 直传）
   │
   └── 定时任务 (*/30 * * * *) → POST /api/cron/cleanup → 清理过期临时文件
```

## 应用容器 (jp4)

Zhe 的 Next.js 应用以单个 Docker 容器运行在 jp4 的 `/data/zhe`，由共享 Caddy 暴露为 `origin.zhe.to`。

### Dockerfile

三阶段构建：Bun 装依赖，Node 构建与运行。

| 阶段      | 基础镜像                     | 内容                                                                     |
| --------- | ---------------------------- | ------------------------------------------------------------------------ |
| `deps`    | `oven/bun:1`                 | `bun install --frozen-lockfile` 安装依赖                                 |
| `builder` | `node:26.13.1-bookworm-slim` | `node …/next build` 构建 Next.js（standalone）                           |
| `runner`  | `node:26.13.1-bookworm-slim` | 复制 `.next/standalone`、`.next/static`、`public`，运行 `node server.js` |

> **为何 build/runtime 不用 Bun**：Bun 1.3.14 在 `next build` 收尾阶段会 segfault（SIGILL / exit 132），导致 Docker `RUN` 失败。`bun install` 本身稳定，故仅 deps 阶段使用 Bun。

运行时环境变量：

| 变量       | 值           |
| ---------- | ------------ |
| `NODE_ENV` | `production` |
| `PORT`     | `7005`       |
| `HOSTNAME` | `0.0.0.0`    |

`deploy/compose.yaml` 把容器端口 7005 发布到 `127.0.0.1:17006`，只监听回环地址；外部流量一律经 Caddy 与 Worker。

### 部署与回滚

- 成功 main CI 触发固定的 `nocoo/base-ci` Docker CD 工作流：构建并推送 `ghcr.io/nocoo/zhe`，再按 digest 拉到 jp4 的 `/data/zhe` 重启容器。
- CD 先做私有源站验收（镜像 digest、OCI source revision、版本、`/api/live` no-store 健康、静态资源、未认证 401），再按 `DEPLOY_URL`、`DEPLOY_ORIGIN_MARKER` 做公共验收。
- 回滚只能恢复已记录的 digest（`.base-ci-releases/<SHA>.json`），不使用 `latest`，也不重新构建。

### Next.js 配置

`next.config.ts`：

| 配置项                                      | 值                     | 说明                                                                                                                  |
| ------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `output`                                    | `standalone`           | Docker 部署所需的独立输出模式                                                                                         |
| `allowedDevOrigins`                         | `["zhe.dev.hexly.ai"]` | 开发环境允许的来源                                                                                                    |
| `experimental.serverActions.allowedOrigins` | `["zhe.to"]`           | 前面的反向代理把 `x-forwarded-host` 改写成 `origin.zhe.to`，与浏览器 `Origin`（`zhe.to`）不一致，需显式信任浏览器域名 |
| Webpack/Turbopack alias                     | 替换 polyfill 为空模块 | 目标浏览器原生支持所有 polyfill，节省 ~11 KiB                                                                         |

## Cloudflare Worker (zhe-edge)

独立项目，位于 `worker/` 目录，作为 `zhe.to` 的全透明反向代理。

### Worker 配置

`worker/wrangler.toml`：

| 配置项      | 值                           |
| ----------- | ---------------------------- |
| Worker 名称 | `zhe-edge`                   |
| KV 绑定     | `LINKS_KV`                   |
| 定时任务    | `*/30 * * * *`（每 30 分钟） |
| 兼容日期    | `2025-01-01`                 |

### Worker Secrets

通过 `wrangler secret put` 设置：

| Secret          | 用途                                                           |
| --------------- | -------------------------------------------------------------- |
| `ORIGIN_URL`    | 源站地址 `https://origin.zhe.to`                               |
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

| Cloudflare 头     | 映射为                | 使用方                   |
| ----------------- | --------------------- | ------------------------ |
| `CF-IPCountry`    | `x-vercel-ip-country` | `extractClickMetadata()` |
| `request.cf.city` | `x-vercel-ip-city`    | `extractClickMetadata()` |

### 透明代理行为

- `Host` 由 fetch 目标决定（源站看到 `origin.zhe.to`）；公开主机名经 `X-Real-Host`（Caddy 不改写）与 `X-Forwarded-Host` 传递
- 设置 `X-Forwarded-For`（取 `CF-Connecting-IP`）、`X-Forwarded-Proto`、`X-Forwarded-Host`、`X-Real-Host`
- 使用 `redirect: 'manual'` 透传源站重定向
- 静态资源直接转发到源站

## Cloudflare D1

`wrangler.toml`（根目录）：

| 配置项   | 值       |
| -------- | -------- |
| 项目名   | `zhe`    |
| 数据库名 | `zhe-db` |
| 绑定名   | `DB`     |

D1 通过 Worker 代理访问（非容器直连）：应用侧 `lib/db/d1-client.ts` 把 SQL POST 到 `D1_PROXY_URL` 的 `/api/d1-query`，由 Worker 用 D1 绑定执行，`D1_PROXY_SECRET` 认证。本地与 CI 的迁移、种子仍直连 D1 REST API（超时 5 秒）。

## Cloudflare KV

用于边缘短链接缓存。每个条目存储重定向所需的最少数据：

```json
{
  "id": 42,
  "originalUrl": "https://example.com/long-url",
  "expiresAt": 1735689600000
}
```

**同步策略**：写穿透（每次 CRUD 操作内联同步） + 首次访问全量同步（安全网）。手动触发：`POST /api/cron/sync-kv`（需 `WORKER_SECRET` 认证）。无定时同步。

## Cloudflare R2

S3 兼容对象存储，用于文件上传和临时文件。通过预签名 URL 实现客户端直传：

- **永久文件**：`{user-hash}/YYYYMMDD/{uuid}.{ext}`
- **临时文件**：`tmp/{uuid}_{timestamp}.{ext}`（1 小时后自动清理）

## 定时任务

| 计划           | 动作                     | 用途                     |
| -------------- | ------------------------ | ------------------------ |
| `*/30 * * * *` | `POST /api/cron/cleanup` | 删除 R2 中过期的临时文件 |

KV 同步不依赖定时任务，而是在每次 mutation 时内联执行。

## 域名

| 域名             | 用途                                                             |
| ---------------- | ---------------------------------------------------------------- |
| `zhe.to`         | 生产域名（Cloudflare → Worker → `origin.zhe.to` → Caddy → 容器） |
| `origin.zhe.to`  | 源站域名，Worker 转发目标；Cloudflare 代理，源站 IP 不入 DNS     |
| `s.zhe.to`       | R2 文件公开访问 CDN 域名（`R2_PUBLIC_DOMAIN`）                   |
| `localhost:7006` | 本地开发                                                         |

### 为什么保留 `origin.zhe.to`

- `zhe.to/*` 绑定在 `zhe-edge` 路由上，Worker 不能再 fetch `zhe.to`，否则自环。
- Workers 的 `fetch()` 需要一个带合法证书的域名作目标，不能直接指向源站 IP；否则要维护 IP SAN 证书，还得把 IP 写进配置。
- 它是公开域名与部署目标之间唯一的解耦点：换机器、换 IP、换容器只改这一条解析和（必要时）`ORIGIN_URL` 一个 secret，`zhe.to`、OAuth 回调、CLI 与短链域名都不变。
- 它经 Cloudflare 代理，源站 IP 不出现在公共 DNS 里，也不作为入口直接暴露。

因此 `origin.zhe.to` 不能“干掉”：任何替代方案仍要一个 Worker 可达的域名（比如换个 `zhe.to` 子域），那只是重命名；直接改成 IP 更差。删 Worker 路由、改回 apex 或删域名都会断掉转发、KV 回源、分析与 cron。

## 保留路径

以下路径不可用作短链接 slug（Worker 和中间件均检查）：

```
login, logout, auth, callback, dashboard, api,
admin, live, _next, static, favicon.ico, robots.txt, sitemap.xml
```

Worker 中的 `RESERVED_PATHS` 集合必须与 `lib/constants.ts` 保持同步。

## 环境变量

### 必填

| 变量                        | 用途                                 |
| --------------------------- | ------------------------------------ |
| `AUTH_SECRET`               | Auth.js 加密密钥                     |
| `AUTH_GOOGLE_ID`            | Google OAuth 客户端 ID               |
| `AUTH_GOOGLE_SECRET`        | Google OAuth 客户端密钥              |
| `CLOUDFLARE_ACCOUNT_ID`     | Cloudflare 账号 ID                   |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 数据库 ID                         |
| `CLOUDFLARE_API_TOKEN`      | Cloudflare API Token（D1 + KV 访问） |

### 可选（KV 缓存）

| 变量                         | 用途                                   |
| ---------------------------- | -------------------------------------- |
| `CLOUDFLARE_KV_NAMESPACE_ID` | KV 命名空间 ID（未配置则跳过 KV 同步） |

### 可选（文件上传）

| 变量                   | 用途                           |
| ---------------------- | ------------------------------ |
| `R2_ACCESS_KEY_ID`     | S3 兼容存储 Access Key         |
| `R2_SECRET_ACCESS_KEY` | S3 兼容存储 Secret Key         |
| `R2_ENDPOINT`          | S3 兼容端点 URL                |
| `R2_BUCKET_NAME`       | R2 存储桶名称                  |
| `R2_PUBLIC_DOMAIN`     | R2 公开访问域名                |
| `R2_USER_HASH_SALT`    | 用户 ID 哈希盐值（文件夹隔离） |

### 可选（安全）

| 变量            | 用途                                              |
| --------------- | ------------------------------------------------- |
| `WORKER_SECRET` | Worker 共享密钥（保护 cron 和 record-click 端点） |

## 相关文档

- [环境搭建与运行](02-getting-started.md)
- [架构概览](01-architecture.md)
- [数据库设计](04-database.md)
