# 部署与配置

本文档描述 Zhe 的生产部署架构和配置细节。

> 返回 [README](../README.md)

## 部署架构

```
用户请求
   │
   ▼
Vercel Edge Network
   │
   ├──▶ Edge Middleware (middleware.ts)
   │       ├── 短链接重定向 (307)
   │       ├── 认证检查 → 未登录重定向到 /
   │       └── 静态资源直通
   │
   ├──▶ Next.js Server (App Router)
   │       ├── Server Actions → D1 HTTP API
   │       └── API Routes
   │
   ├──▶ Cloudflare D1 (SQLite)
   │       └── 数据持久化
   │
   └──▶ Cloudflare R2 (S3 兼容)
           └── 文件存储
```

## Vercel 配置

`vercel.json`：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| Framework | `nextjs` | 自动检测 |
| Region | `sfo1` | 美西区域 |
| 安全头 | `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection` | 所有路由 |

## Cloudflare D1

`wrangler.toml`：

| 配置项 | 值 |
|--------|-----|
| 项目名 | `zhe` |
| 数据库名 | `zhe-db` |
| 兼容日期 | `2024-01-01` |
| 绑定名 | `DB` |

D1 通过 HTTP API 访问（非 Workers 绑定），支持从任意环境（Vercel、本地）读写。

## Next.js 配置

`next.config.ts`：

- 允许的开发来源：`zhe.dev.hexly.ai`
- Webpack + Turbopack alias：替换 Next.js 内置 polyfill 为空模块，节省约 11 KiB

## 域名

- **生产域名**：`zhe.to`
- **开发端口**：`7005`

## 安全头

所有路由自动添加：

| 头部 | 值 | 说明 |
|------|-----|------|
| `X-Content-Type-Options` | `nosniff` | 防止 MIME 类型嗅探 |
| `X-Frame-Options` | `DENY` | 防止页面被嵌入 iframe |
| `X-XSS-Protection` | `1; mode=block` | XSS 过滤 |

## 保留路径

以下路径不可用作短链接 slug：

```
login, logout, auth, callback, dashboard, api,
admin, live, _next, static, favicon.ico, robots.txt, sitemap.xml
```

## 相关文档

- [环境搭建与运行](02-getting-started.md)
- [数据库设计](04-database.md)
