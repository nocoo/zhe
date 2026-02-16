# 环境搭建与运行

本文档描述如何在本地搭建开发环境和运行项目。

> 返回 [README](../README.md)

## 前置要求

| 工具 | 版本 | 用途 |
|------|------|------|
| [Bun](https://bun.sh) | >= 1.0 | 运行时 + 包管理器 |
| [Node.js](https://nodejs.org) | >= 20 | Vitest 测试运行（使用 `npx vitest`） |
| [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) | >= 4.0 | Cloudflare D1 管理（可选） |

## 安装依赖

```bash
bun install
```

安装完成后，Husky Git Hooks 会自动配置（通过 `prepare` 脚本）。

## 环境变量

复制示例文件并填写配置：

```bash
cp .env.example .env.local
```

### 必填变量

| 变量 | 来源 | 说明 |
|------|------|------|
| `AUTH_SECRET` | `openssl rand -base64 32` | Auth.js 加密密钥 |
| `AUTH_GOOGLE_ID` | Google Cloud Console | Google OAuth 客户端 ID |
| `AUTH_GOOGLE_SECRET` | Google Cloud Console | Google OAuth 客户端密钥 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard | Cloudflare 账号 ID |
| `CLOUDFLARE_D1_DATABASE_ID` | Cloudflare Dashboard | D1 数据库 ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard | Cloudflare API Token |

### 可选变量（文件上传功能）

| 变量 | 说明 |
|------|------|
| `R2_ACCESS_KEY_ID` | S3 兼容存储 Access Key |
| `R2_SECRET_ACCESS_KEY` | S3 兼容存储 Secret Key |
| `R2_ENDPOINT` | S3 兼容端点 URL |
| `R2_BUCKET_NAME` | R2 存储桶名称 |
| `R2_PUBLIC_DOMAIN` | R2 公开访问域名 |
| `R2_USER_HASH_SALT` | 用户 ID 哈希盐值 |

### 可选变量（安全）

| 变量 | 说明 |
|------|------|
| `INTERNAL_API_SECRET` | 内部 API 共享密钥（保护 `record-click` 端点） |

## 启动开发服务器

```bash
bun dev
```

服务默认运行在 **http://localhost:7005**，使用 Turbopack 加速编译。

## 常用命令

| 命令 | 说明 |
|------|------|
| `bun dev` | 启动开发服务器（端口 7005，Turbopack） |
| `bun run build` | 生产构建 |
| `bun run start` | 启动生产服务器 |
| `bun run lint` | ESLint 检查（零警告策略） |
| `bun run test` | Watch 模式运行测试 |
| `bun run test:run` | 运行全部测试（单次） |
| `bun run test:unit` | 仅运行单元测试（排除 E2E） |
| `bun run test:e2e` | 仅运行 E2E 测试 |
| `bun run test:coverage` | 运行测试并生成覆盖率报告 |
| `bun run generate:logos` | 从源图生成全套 Logo 尺寸 |

## 数据库迁移

使用 Wrangler CLI 执行 D1 迁移：

```bash
# 查看数据库列表
npx wrangler d1 list

# 执行迁移（远程）
npx wrangler d1 execute zhe-db --remote --file=drizzle/migrations/0003_add_link_metadata.sql

# 执行迁移（本地开发）
npx wrangler d1 execute zhe-db --file=drizzle/migrations/0003_add_link_metadata.sql
```

也可以使用 Drizzle Kit：

```bash
# 生成新迁移
npx drizzle-kit generate

# 执行迁移（需要 .env 中的 Cloudflare credentials）
npx drizzle-kit migrate
```

## 相关文档

- [架构概览](01-architecture.md)
- [测试策略](05-testing.md)
- [部署与配置](06-deployment.md)
