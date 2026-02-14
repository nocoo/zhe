<p align="center">
  <img src="public/logo-light-80.png" alt="Zhe Logo" width="80" height="80">
</p>

<h1 align="center">Zhe</h1>

<p align="center">
  <strong>极简短链接服务</strong><br>
  自部署 · 边缘运行 · 隐私优先
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/Cloudflare_D1-edge-orange" alt="Cloudflare D1">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

---

## ✨ 功能特点

- 🔗 **短链接管理** — 创建、编辑、删除短链接，支持自定义 slug
- 📊 **访问分析** — 实时追踪点击量、来源、设备等统计数据
- 📁 **文件上传** — 通过 S3 兼容存储分享文件，生成短链接
- 🌗 **深色模式** — 自动跟随系统主题切换
- 🔒 **Google OAuth** — 安全的身份认证，仅授权用户可管理
- ⚡ **边缘部署** — 基于 Cloudflare D1，全球低延迟访问

## 🚀 快速开始

### 1️⃣ 安装依赖

```bash
# 需要先安装 Bun: https://bun.sh
bun install
```

### 2️⃣ 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下内容：

```bash
# Google OAuth (从 Google Cloud Console 获取)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret

# Auth.js 密钥 (生成命令: openssl rand -base64 32)
AUTH_SECRET=your-generated-secret-here

# Cloudflare D1 数据库
CLOUDFLARE_D1_TOKEN=your-d1-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_DATABASE_ID=your-database-id

# (可选) S3 兼容存储 — 用于文件上传功能
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_BUCKET=your-bucket-name
S3_ENDPOINT=https://your-endpoint
S3_PUBLIC_URL=https://your-public-url
```

### 3️⃣ 启动开发服务器

```bash
bun dev
```

打开浏览器访问 👉 [http://localhost:7005](http://localhost:7005)

## 🛠️ 技术栈

| 组件 | 选型 |
|------|------|
| ⚡ Runtime | [Bun](https://bun.sh) |
| 🖥️ Framework | [Next.js 15](https://nextjs.org) (App Router) |
| 📝 Language | TypeScript (strict mode) |
| 🗄️ Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) + [Drizzle ORM](https://orm.drizzle.team) |
| 🎨 UI | [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| 🔐 Auth | [Auth.js v5](https://authjs.dev) (Google OAuth) |
| 📦 Storage | S3 兼容存储 (文件上传) |

## 📋 常用命令

| 命令 | 说明 |
|------|------|
| `bun dev` | 启动开发服务器 (端口 7005) |
| `bun run build` | 生产构建 |
| `bun run lint` | ESLint 检查 |
| `bun run test` | Watch 模式运行测试 |
| `bun run test:run` | 运行全部测试 |

## 📄 License

[MIT](LICENSE) © 2026
