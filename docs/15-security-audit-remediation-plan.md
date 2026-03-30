# 安全与隐私修复计划

本文档规划针对安全/隐私审计发现问题的修复优先级和实施步骤。

> 返回 [README](../README.md) | 参考 [质量体系升级](13-quality-system-upgrade.md)

---

## 一、问题分类总览

| 类别 | 数量 | 说明 |
|------|------|------|
| **P0/P1 — 真实漏洞** | 10 | 8 ✅ 已完成，2 ⬜ 待实施 |
| **P2 — 建议实施** | 5 | 有真实风险，建议修复 |
| **低优 — 工程规范** | 5 | 不影响安全，随功能处理 |

---

## 二、P0/P1 — 必须修复的真实漏洞

### 2.1 Critical — `AUTH_SECRET` 使用弱熵默认值

**文件**: `.env.local:2`
**问题**: `AUTH_SECRET=zhe-auth-secret-dev-only-change-in-production` — 熵极低，且值本身表明是开发默认值
**风险**: 若生产环境使用此值，攻击者可伪造 JWT 冒充任意用户
**修复**:
```bash
# 生成新的生产 AUTH_SECRET（最小 32 字节熵）
openssl rand -base64 32
# 在 Railway env var 中替换旧值
```

---

### 2.2 High — `WORKER_SECRET` 未配置时跳过认证

**文件**: `app/api/record-click/route.ts:14`
**问题**: `if (workerSecret) { ... }` — 变量未定义时静默放行
**风险**: 任何未认证调用者可伪造点击数据、发起 DOS
**修复**:
```ts
if (!workerSecret) {
  return NextResponse.json(
    { error: 'Server misconfiguration: WORKER_SECRET not set' },
    { status: 500 }
  );
}
```
**参考**: `app/api/cron/cleanup/route.ts:17-22` 和 `app/api/cron/sync-kv/route.ts:18-22` 已正确实现

---

### 2.3 High — Secret 比较使用非恒定时间算法

**文件**: `app/api/record-click/route.ts:17`, `app/api/cron/sync-kv/route.ts:34`, `app/api/cron/cleanup/route.ts:32`
**问题**: `!==` 比较存在时序攻击风险（首字节不匹配即返回）
**修复**:
```ts
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

---

### 2.4 High — Short Link URL 协议校验缺失

**文件**: `middleware.ts:115`, `actions/links.ts:40-44`, `models/webhook.ts:60-64`
**问题**: `new URL()` 接受 `javascript:`、`data:` 等危险 scheme
**风险**: 可创建指向 `data:text/html,...` 的短链接（部分浏览器/上下文可渲染）
**修复**:
```ts
const parsed = new URL(url);
if (!['http:', 'https:'].includes(parsed.protocol)) {
  throw new Error('URL must use http or https protocol');
}
```

---

### 2.5 High — Backy Webhook SSRF

**文件**: `actions/backy.ts:90,119,211`, `models/backy.ts:63`
**问题**: `webhookUrl` 仅校验格式不校验目标，可指向 `http://169.254.169.254`（云元数据端点）或任意内网 IP
**风险**: 攻击者可利用用户配置的 API key 发请求到内网并获取响应体
**修复**:
1. 强制 `https:` 协议
2. **禁用自动重定向**：fetch 时使用 `redirect: 'manual'`，对每个重定向响应目标重复做步骤 3 的 IP 校验；或自己实现重定向跟随逻辑并逐跳校验
3. DNS 解析后校验目标 IP，block 私有 IP 段：
   - `127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`
   - `169.254.169.254`（AWS/GCP metadata）
   - IPv6: `::1`、`fc00::/7`、`fe80::/10`

> **关键**：初始 URL 通过校验不等于最终请求目标安全。攻击者可让初始 URL 指向公网 HTTPS，再 302 重定向到内网地址——必须对每一跳目标重复做 IP 校验，或禁用自动重定向后自行控制。

---

### 2.6 High — xray API URL SSRF

**文件**: `actions/xray.ts:156,193,247,293`, `models/xray.ts:157`
**问题**: 同 2.5，`xrayApiUrl` 接受任意 URL，用户 API token 被发往攻击者控制的 URL
**修复**: 同 2.5（禁用重定向 + 每跳 IP 校验）

---

### 2.7 High — `WORKER_SECRET` 通过 Query Parameter 传递

**文件**: `app/api/cron/sync-kv/route.ts:29`, `app/api/cron/cleanup/route.ts:27`
**问题**: `?secret=<WORKER_SECRET>` 写入 HTTP access log、CDN log、Browser history、Referer header
**风险**: Secret 暴露于多个日志层，攻击面大幅增加
**修复**: 移除 query fallback，仅通过 `Authorization: Bearer` header 传递

---

### 2.8 High — 临时上传 R2 fallback 含硬编码真实域名

**文件**: `app/api/tmp/upload/[token]/route.ts:111`
**问题**: `process.env.R2_PUBLIC_DOMAIN || "https://s.zhe.to"` — 未配置时静默回退到真实 R2 域
**风险**: Fork 未配置 env 时生成的 URL 均指向原始作者的 R2 bucket
**修复**:
```ts
const publicDomain = process.env.R2_PUBLIC_DOMAIN;
if (!publicDomain) {
  throw new Error('R2_PUBLIC_DOMAIN environment variable is required');
}
```

---

### 2.9 Critical — 真实 Cloudflare D1/KV IDs 在版本库中

**文件**: `docs/14-cloudflare-resource-inventory.md`
**问题**: 4 个真实资源 UUID 已进入版本控制

| 资源 | UUID | 行号 |
|------|------|------|
| 生产 D1 | `<YOUR_D1_DATABASE_ID>` | 27, 69, 70, 218 |
| 测试 D1 | `<YOUR_TEST_D1_DATABASE_ID>` | 28 |
| 生产 KV | `<YOUR_KV_NAMESPACE_ID>` | 41, 221 |
| 测试 KV | `<YOUR_TEST_KV_NAMESPACE_ID>` | 42 |

**修复**（macOS/GNU sed 兼容）：
```bash
已替换为占位符（见 `docs/14-cloudflare-resource-inventory.md` 当前版本）。

```bash
# 如果需要重新替换（macOS/GNU sed 兼容）：
# sed -i '' 's/<REAL_D1_ID>/<YOUR_D1_DATABASE_ID>/g' docs/14-cloudflare-resource-inventory.md
# sed -i '' 's/<REAL_TEST_D1_ID>/<YOUR_TEST_D1_DATABASE_ID>/g' docs/14-cloudflare-resource-inventory.md
# sed -i '' 's/<REAL_KV_ID>/<YOUR_KV_NAMESPACE_ID>/g' docs/14-cloudflare-resource-inventory.md
# sed -i '' 's/<REAL_TEST_KV_ID>/<YOUR_TEST_KV_NAMESPACE_ID>/g' docs/14-cloudflare-resource-inventory.md
```
```

---

### 2.10 High — GitHub Preview Image URL 指向真实 R2 Bucket

**文件**: `models/links.ts:207`
**问题**: 旧版 README 引用了 R2 真实路径（含用户 hash + UUID），暴露 key 结构；图片被删则预览失效
**修复**:
1. 下载图片到 `public/github-preview.jpg`
2. 改为本地引用：
```ts
export const GITHUB_REPO_PREVIEW_URL = '/github-preview.jpg';
```

---

## 三、P2 — 建议实施（真实风险）

### 3.1 `resolvePublicOrigin()` 应加 allowlist 而非替换为单值

**文件**: `lib/url.ts:18-33`
**说明**: 当前通过 `X-Real-Host` 修复 Railway 代理改写 host 的问题是合理设计；Worker 直连 / 本地 dev / 代理场景均依赖此机制。全量替换为单值 `PUBLIC_ORIGIN` 会破坏现有架构。

**建议修复**: 保留 header 推导逻辑，对推导出的 host 进行 allowlist 校验。`TRUSTED_ORIGINS` 环境变量以逗号分隔可信任域名列表（不含协议）。校验时需用 `hostname:port` 格式比对（因为 `localhost:7006` 和 `localhost` 是不同项）。当 host 不在 allowlist 中时，fallback 到 `PUBLIC_ORIGIN` 或拒绝请求。具体实现时注意：`origin.host` 包含端口号，需与 allowlist 中格式一致；允许列表应包含本地开发域名（如 `localhost:7006`）和生产域名。

---

### 3.2 `importLinks()` 无数量上限

**文件**: `actions/settings.ts:24-83`
**问题**: 可导入任意规模数据触发海量 D1 INSERT，耗尽 D1 rate limit
**修复**: 添加上限（如 10,000 条/次），分批处理

---

### 3.3 存储统计未按用户隔离

**文件**: `actions/storage.ts:23-63`
**问题**: 返回全系统统计而非单用户；R2 listing 暴露所有对象 key
**修复**: 添加 `WHERE user_id = ?`；R2 listing 按用户 hash prefix 过滤

---

### 3.4 Error message 可能泄露内部信息

**文件**: `actions/links.ts:113-116`, `actions/upload.ts:65-68`
**修复**: 统一返回通用错误消息，详细错误仅写 server-side log

---

### 3.5 内存 Rate Limiter 不跨实例

**文件**: `models/webhook.ts:135-177`
**问题**: Railway 多实例部署下可绕过限速
**建议**: 可选地改用 D1 表（`_request_counts` 已有结构）存储计数器

---

## 四、已确认不需要修改的条目

> 以下条目经审查后确认暂不需要修改或属于开源规范：

| 条目 | 文件 | 原因 |
|------|------|------|
| `/api/lookup` 返回 `id` | `app/api/lookup/route.ts:28` | Worker KV miss fallback 强依赖此字段删除会造成功能回退和统计丢失 |
| Webhook API CORS | `app/api/link/create/[token]/route.ts:77` 等 | 这些是 token 鉴权的 server-to-server 接口，非浏览器 session 接口；按 Origin 校验会误伤 CLI/Worker 调用方 |
| `next.config.ts` 中 `zhe.to` | `next.config.ts:14` | 公开部署域名，不需要强制 env 化 |
| `xray` preset URLs | `models/xray.ts:9-10` | 公开 API 端点，不涉及 secrets；改为单一 XRAY_API_URL 会改变产品 preset 选择功能 |
| README/deployment docs 中的 `zhe.to` | `README.md`, `docs/06-deployment.md` | README 作为 demo 实例展示可接受；部署文档可逐步改为占位符，低优先级 |
| Docker root 用户 | `Dockerfile:15` | container root 默认不等于 host root；降为可选加固项 |

---

## 五、低优 — 工程规范（随功能处理）

| # | 问题 | 文件 | 建议 |
|---|------|------|------|
| 5.1 | `next-auth` Beta 版本 | `package.json:49` | 监控 Auth.js 安全公告，stable v5 发布后升级 |
| 5.2 | `wrangler.toml` 含生产 D1 ID | `wrangler.toml:7` | 已 gitignore；确保 `.example` 永远正确 |
| 5.3 | 测试文件用真实域名 | 50+ 测试文件 | 随功能修改时顺带替换为 `example.com` |
| 5.4 | Webhook API spec title 含真实域名 | `models/webhook.ts:195` | 改为基于 `AUTH_URL` 动态生成 |
| 5.5 | E2E Provider 依赖可覆盖的 `NODE_ENV` | `auth.ts:17` | 增加 `PLAYWRIGHT_SECRET` 检查 |

---

## 六、修复顺序

```
Phase 1 (立即)
  ├── 2.1 AUTH_SECRET 轮换（如生产在使用默认值）  ← 需人工操作
  ├── 2.2 WORKER_SECRET 强制校验                    ✅ 已完成
  ├── 2.3 时序安全比较                              ✅ 已完成
  └── 2.9 真实 D1/KV IDs 替换                      ✅ 已完成

Phase 2 (本周)
  ├── 2.4 URL 协议白名单                            ✅ 已完成
  ├── 2.5 Backy SSRF 防护（含重定向链逐跳校验）    ⬜ 待实施（P2）
  ├── 2.6 xray SSRF 防护（含重定向链逐跳校验）    ⬜ 待实施（P2）
  ├── 2.7 移除 query-secret fallback                ✅ 已完成
  └── 2.8 R2_PUBLIC_DOMAIN 强制校验                 ✅ 已完成

Phase 3 (下周)
  ├── 2.10 GitHub preview image 移至 public/        ✅ 已完成
  ├── 3.2 importLinks 上限                          ⬜ 待实施（P2）
  ├── 3.3 存储统计用户隔离                          ⬜ 待实施（P2）
  └── 3.4 统一错误消息                              ⬜ 待实施（P2）

Phase 4 (规划)
  ├── 3.1 resolvePublicOrigin allowlist             ⬜ 待实施（P2）
  └── 3.5 分布式限速（可选）                        ⬜ 待实施（P2）
```

---

## 七、Gitignore 确认（已正确处理）

| 文件 | 状态 |
|------|------|
| `worker/wrangler.toml` | ✅ 已 gitignore |
| `wrangler.toml` | ✅ 已 gitignore |
| `.env.local` | ✅ 已 gitignore |

gitleaks 规则（`.gitleaks.toml`）也已配置。

---

## 八、防御性措施（可选）

| 措施 | 说明 |
|------|------|
| pre-commit regex 检查 | 检测常见 UUID 格式并警告 |
| 新文档模板 | 使用 `<YOUR_RESOURCE_ID>` 占位符 |
| 新 PR checklist | "是否引入了新的真实资源 ID？" |

---

> **注意**: 本文档仅记录计划，不包含任何代码修改。修复前请先 Review。
