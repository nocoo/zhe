# Cloudflare 资源清单与测试隔离

本文档记录 zhe 项目在 Cloudflare 上的所有资源（D1、KV、R2），定义生产/测试命名规范，并规划测试环境隔离方案。

> 返回 [README](../README.md) | 参考 [测试策略](05-testing.md) | [质量体系升级](13-quality-system-upgrade.md)

---

## 一、命名规范

产品名 `zhe`，所有 Cloudflare 资源遵循以下命名：

| 资源类型 | 生产 | 测试 |
|----------|------|------|
| D1 Database | `zhe-db` | `zhe-db-test` |
| R2 Bucket | `zhe` | `zhe-test` |
| KV Namespace | `zhe` | `zhe-test` |

---

## 二、当前资源盘点

### D1 Database

| 名称 | UUID | 用途 | 状态 |
|------|------|------|------|
| `zhe-db` | `2ec5605c-613a-4c3a-a815-1ff7776bf6ab` | **生产** — 线上短链接数据 | ✅ 已存在 |
| `zhe-db-test` | — | **测试** — L2/L3 E2E 测试专用 | ⬜ 待创建 |

### R2 Bucket

| 名称 | 公开域名 | 用途 | 状态 |
|------|----------|------|------|
| `zhe` | `s.zhe.to` | **生产** — 用户上传文件、OG 截图 | ✅ 已存在 |
| `zhe-test` | — | **测试** — L2/L3 E2E 测试专用 | ⬜ 待创建 |

### KV Namespace

| 名称 | ID | 用途 | 状态 |
|------|------|------|------|
| `zhe` | `7d4702bf5657489cbc6a266e10db1aba` | **生产** — Worker 边缘短链缓存 | ✅ 已存在 |
| `zhe-test` | — | **测试** — L2/L3 E2E 测试专用 | ⬜ 待创建 |

### Cloudflare Worker

| 名称 | 绑定 | 用途 |
|------|------|------|
| `zhe-edge` | KV: `zhe`，Secret: `ORIGIN_URL`, `WORKER_SECRET` | 边缘代理 + 短链 KV 解析 + Cron 清理 |

---

## 三、当前风险：测试直接操作生产数据

### 风险矩阵

| 资源 | L2 API E2E | L3 Playwright | 风险等级 |
|------|-----------|--------------|---------|
| **D1** | ⚠️ 有 `D1_TEST_DATABASE_ID` 防护，但指向生产 `zhe-db` | ❌ 无任何防护，直接 INSERT/DELETE 到 `zhe-db` | 🔴 **高** |
| **R2** | 不涉及 | ⚠️ upload 被浏览器 mock，但 delete/screenshot 走真实 `zhe` bucket | 🟠 **中** |
| **KV** | 不涉及 | 不涉及（`.env.local` 未配 `CLOUDFLARE_KV_NAMESPACE_ID`） | 🟡 **低**（碰巧安全） |

### 具体问题

#### D1: 生产和测试共用同一个数据库

`.env.local` 配置：

```
CLOUDFLARE_D1_DATABASE_ID=2ec5605c-613a-4c3a-a815-1ff7776bf6ab   ← zhe-db (生产)
D1_TEST_DATABASE_ID=2ec5605c-613a-4c3a-a815-1ff7776bf6ab         ← 同一个！
```

- **L2 API E2E**（`tests/api/helpers/seed.ts`）：有 `D1_TEST_DATABASE_ID` 校验，但两个 ID 相同 → 防护形同虚设
- **L3 Playwright**（`tests/playwright/helpers/d1.ts`）：完全无 `D1_TEST_DATABASE_ID` 校验，直接读 `CLOUDFLARE_D1_DATABASE_ID` 操作

**影响**：E2E 测试的 INSERT/DELETE 操作直接修改生产数据。测试用户 ID 有前缀（`e2e-test-user`、`api-e2e-test-user`），afterAll 会按 `user_id` 清理，但如果测试中途崩溃则残留脏数据。

#### R2: 测试服务器使用生产 bucket

`.env.local` 配置：

```
R2_BUCKET_NAME=zhe           ← 生产 bucket
R2_PUBLIC_DOMAIN=https://s.zhe.to
```

- L3 Playwright `uploads.spec.ts`：浏览器端 PUT 被 `page.route()` mock → 不写入
- 但 `deleteUpload()` server action 在服务端执行 → S3 SDK 直接调 `zhe` bucket
- 创建链接触发 OG screenshot → `uploadBufferToR2()` 写入 `zhe` bucket

#### KV: 碰巧安全但无设计防护

`.env.local` 未配置 `CLOUDFLARE_KV_NAMESPACE_ID`，所以 `lib/kv/client.ts` 的 `getKVCredentials()` 返回 null，KV 操作静默跳过。但如果未来有人加上该 env var 指向生产 KV，测试创建的链接会写入生产 KV。

---

## 四、隔离方案

### 目标

测试环境（L2 + L3）使用独立的 `zhe-db-test` / `zhe-test` / `zhe-test` 资源，与生产完全隔离。

### Step 1: 创建测试资源

```bash
# D1: 创建测试数据库
npx wrangler d1 create zhe-db-test

# R2: 创建测试 bucket
npx wrangler r2 bucket create zhe-test

# KV: 创建测试 namespace
npx wrangler kv namespace create zhe-test
```

### Step 2: 初始化测试 D1 schema

```bash
# 对测试库执行所有迁移
for f in drizzle/migrations/*.sql; do
  npx wrangler d1 execute zhe-db-test --remote --file="$f"
done
```

### Step 3: 更新 `.env.local`

```bash
# 生产凭据（不变）
CLOUDFLARE_D1_DATABASE_ID=2ec5605c-613a-4c3a-a815-1ff7776bf6ab
R2_BUCKET_NAME=zhe
# CLOUDFLARE_KV_NAMESPACE_ID=7d4702bf5657489cbc6a266e10db1aba  (Worker 使用，应用不直接配)

# 测试凭据（新增）
D1_TEST_DATABASE_ID=<zhe-db-test 的 UUID>
R2_TEST_BUCKET_NAME=zhe-test
KV_TEST_NAMESPACE_ID=<zhe-test 的 ID>
```

### Step 4: 代码改动

#### 4a. L2 API E2E — D1 已有防护，需要指向测试库

`run-api-e2e.ts` 启动 dev server 时，将 `CLOUDFLARE_D1_DATABASE_ID` 覆盖为 `D1_TEST_DATABASE_ID`：

```typescript
// scripts/run-api-e2e.ts — startServer()
const child = spawn('bun', ['run', 'next', 'dev', ...], {
  env: {
    ...process.env,
    CLOUDFLARE_D1_DATABASE_ID: process.env.D1_TEST_DATABASE_ID,  // ← 关键
    R2_BUCKET_NAME: process.env.R2_TEST_BUCKET_NAME ?? process.env.R2_BUCKET_NAME,
    PLAYWRIGHT: '1',
    NODE_ENV: 'development',
  },
});
```

`D1_TEST_DATABASE_ID` 安全防护保持不变——但现在它的值和 `CLOUDFLARE_D1_DATABASE_ID` **不同**，防护才真正生效。

#### 4b. L3 Playwright — 补充 D1 安全防护 + 指向测试库

`tests/playwright/helpers/d1.ts`：补充和 L2 `seed.ts` 相同的 `D1_TEST_DATABASE_ID` 校验：

```typescript
function d1Credentials() {
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const testDbId = process.env.D1_TEST_DATABASE_ID;

  // 安全防护：D1_TEST_DATABASE_ID 必须存在且匹配
  if (!testDbId) throw new Error('D1_TEST_DATABASE_ID not set.');
  if (testDbId !== databaseId) throw new Error('D1 safety check failed.');

  return { accountId, databaseId, token };
}
```

`playwright.config.ts` 的 webServer 也需覆盖 env：

```typescript
webServer: {
  command: `... bun run next dev --turbopack -p ${E2E_PORT}`,
  env: {
    ...process.env,
    CLOUDFLARE_D1_DATABASE_ID: process.env.D1_TEST_DATABASE_ID,
    R2_BUCKET_NAME: process.env.R2_TEST_BUCKET_NAME ?? process.env.R2_BUCKET_NAME,
  },
}
```

#### 4c. R2 — 测试服务器使用测试 bucket

L2 和 L3 的 dev server 启动时覆盖 `R2_BUCKET_NAME`（见 4a、4b）。无需改动应用代码——`lib/r2/client.ts` 已从 env var 读取 bucket name。

#### 4d. KV — 预防性防护

`lib/kv/client.ts` 中添加检查：当检测到测试环境时，使用测试 KV namespace：

```typescript
function getKVCredentials(): KVCredentials | null {
  const namespaceId = process.env.PLAYWRIGHT === '1'
    ? process.env.KV_TEST_NAMESPACE_ID
    : process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  // ...
}
```

### Step 5: 更新 `.env.example`

```bash
# Test resources (required for L2/L3 E2E tests)
D1_TEST_DATABASE_ID=          # Must be zhe-db-test UUID, NOT zhe-db
R2_TEST_BUCKET_NAME=zhe-test
KV_TEST_NAMESPACE_ID=         # zhe-test KV namespace ID
```

### Step 6: 更新文档

- `docs/02-getting-started.md` — 添加测试资源创建步骤
- `docs/05-testing.md` — 添加测试隔离说明
- `CLAUDE.md` — 添加环境隔离注意事项

---

## 五、原子化提交

| # | Commit | 内容 |
|---|--------|------|
| 1 | `feat: create test D1, R2, KV resources` | CLI 创建资源，记录 UUID/ID 到本文档 |
| 2 | `feat: initialize zhe-db-test schema` | 对测试 D1 执行全部迁移 |
| 3 | `fix: add D1_TEST_DATABASE_ID guard to Playwright helpers` | `tests/playwright/helpers/d1.ts` 补充安全校验 |
| 4 | `fix: isolate L2 dev server env to use test resources` | `run-api-e2e.ts` 覆盖 D1/R2 env |
| 5 | `fix: isolate L3 webServer env to use test resources` | `playwright.config.ts` 覆盖 D1/R2 env |
| 6 | `feat: add KV test namespace support` | `lib/kv/client.ts` 测试环境使用 `KV_TEST_NAMESPACE_ID` |
| 7 | `docs: update env example and docs for test resource isolation` | `.env.example` + `docs/02` + `docs/05` |

---

## 六、验证清单

- [ ] `zhe-db-test` D1 数据库已创建，UUID 已记录
- [ ] `zhe-test` R2 bucket 已创建
- [ ] `zhe-test` KV namespace 已创建，ID 已记录
- [ ] `zhe-db-test` schema 已初始化（全部迁移执行完毕）
- [ ] `.env.local` 中 `D1_TEST_DATABASE_ID` 指向 `zhe-db-test`（不再等于 `CLOUDFLARE_D1_DATABASE_ID`）
- [ ] `bun run test:api` 通过（使用 `zhe-db-test`，非 `zhe-db`）
- [ ] `bun run test:e2e:pw` 通过（使用 `zhe-db-test` + `zhe-test` bucket）
- [ ] 运行测试前后，`zhe-db` 生产数据无变化
- [ ] `tests/playwright/helpers/d1.ts` 有 `D1_TEST_DATABASE_ID` 校验
- [ ] `.env.example` 包含所有测试资源 env var

---

## 相关文档

- [环境搭建](02-getting-started.md)
- [测试策略](05-testing.md)
- [质量体系升级](13-quality-system-upgrade.md)
- [部署与配置](06-deployment.md)
