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
- 截图上传（`saveScreenshot()` / `fetchAndSaveScreenshot()`，`actions/links.ts:440,455`）是用户手动触发的独立流程，不在普通建链路径中（建链只异步做 metadata enrichment，`actions/links.ts:97`）。但如果 L3 测试触发了截图保存操作，`uploadBufferToR2()` 仍会写入生产 `zhe` bucket

#### KV: 碰巧安全但无设计防护

`.env.local` 未配置 `CLOUDFLARE_KV_NAMESPACE_ID`，所以 `lib/kv/client.ts` 的 `getKVCredentials()` 返回 null，KV 操作静默跳过。但如果未来有人加上该 env var 指向生产 KV，测试创建的链接会写入生产 KV。

---

## 四、隔离方案

### 目标

测试环境（L2 + L3）使用独立的 `zhe-db-test` / `zhe-test` / `zhe-test` 资源，与生产完全隔离。

### 核心设计：`D1_TEST_DATABASE_ID` 语义变更

当前 guard 的语义是"你确认 `CLOUDFLARE_D1_DATABASE_ID` 是测试库"（`D1_TEST_DATABASE_ID === CLOUDFLARE_D1_DATABASE_ID`）。这种设计在生产和测试共用一个 D1 时勉强可用，但无法支持隔离——两个 ID 不同时 guard 会拒绝运行。

**新语义**：`D1_TEST_DATABASE_ID` 是测试库的实际 UUID。测试入口在 env 覆盖后，guard 需要做 **两重检查**：

1. `D1_TEST_DATABASE_ID` 必须存在
2. `D1_TEST_DATABASE_ID` 必须**不等于**原始 `CLOUDFLARE_D1_DATABASE_ID`（防止误配回生产）

为了实现第 2 点，覆盖前需要先记住原始生产 ID，覆盖后再比较。

```
.env.local:
  CLOUDFLARE_D1_DATABASE_ID = 2ec5605c-...  ← zhe-db (生产)
  D1_TEST_DATABASE_ID       = <新创建的 UUID>  ← zhe-db-test (测试)

测试入口逻辑:
  1. prodDbId = process.env.CLOUDFLARE_D1_DATABASE_ID   // 记住生产 ID
  2. testDbId = process.env.D1_TEST_DATABASE_ID
  3. 断言 testDbId 存在
  4. 断言 testDbId !== prodDbId                         // ← 防止误配
  5. process.env.CLOUDFLARE_D1_DATABASE_ID = testDbId   // 覆盖
```

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
R2_PUBLIC_DOMAIN=https://s.zhe.to
# CLOUDFLARE_KV_NAMESPACE_ID=7d4702bf5657489cbc6a266e10db1aba  (Worker 使用，应用不直接配)

# 测试凭据（新增）
D1_TEST_DATABASE_ID=<zhe-db-test 的 UUID>
R2_TEST_BUCKET_NAME=zhe-test
R2_TEST_PUBLIC_DOMAIN=https://test-r2.zhe.to  # 占位域名（不需要实际 DNS，见 4c 说明）
KV_TEST_NAMESPACE_ID=<zhe-test 的 ID>
```

### Step 4: 代码改动

#### 4a. L2 API E2E — 三个进程都要覆盖 env

`run-api-e2e.ts` 中有 **3 个消费 `CLOUDFLARE_D1_DATABASE_ID` 的进程**，都必须覆盖：

1. **`checkPrerequisites()`**（主进程）— 读 `process.env` 做 guard 检查
2. **`startServer()` 子进程**（Next.js dev server）— 通过 `.env.local` 连接 D1
3. **`runHttpTests()` → `runCommand()` 子进程**（Vitest）— `seed.ts` 读 `process.env` 做 D1 HTTP API 操作

**改动方案**：在 `main()` 函数中，加载 `.env.local` 后立即做安全检查并覆盖 `process.env.CLOUDFLARE_D1_DATABASE_ID`。这样 3 个消费方都自动继承（子进程通过 `...process.env` 继承）：

```typescript
// scripts/run-api-e2e.ts — main()
async function main(): Promise<void> {
  loadEnvFile(pathResolve(PROJECT_ROOT, '.env.local'));

  // ---- 关键：安全检查 + 将当前进程的 D1 ID 切换到测试库 ----
  const prodDbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    console.error('❌ D1_TEST_DATABASE_ID not set.');
    process.exit(1);
  }
  if (testDbId === prodDbId) {
    console.error(
      '❌ D1_TEST_DATABASE_ID === CLOUDFLARE_D1_DATABASE_ID. ' +
      'Test DB must differ from production DB.'
    );
    process.exit(1);
  }
  process.env.CLOUDFLARE_D1_DATABASE_ID = testDbId;

  // R2: bucket name + public domain
  if (process.env.R2_TEST_BUCKET_NAME) {
    process.env.R2_BUCKET_NAME = process.env.R2_TEST_BUCKET_NAME;
  }
  if (process.env.R2_TEST_PUBLIC_DOMAIN !== undefined) {
    process.env.R2_PUBLIC_DOMAIN = process.env.R2_TEST_PUBLIC_DOMAIN;
  }

  // Phase 1 & Phase 2 ...
}
```

**Guard 语义变更**（`checkPrerequisites()` + `seed.ts` 的 `d1Credentials()`）：

由于 `main()` 已经执行了完整的安全检查（存在性 + 不等性）并覆盖了 `CLOUDFLARE_D1_DATABASE_ID`，下游的 guard 简化为确认覆盖已生效：

```typescript
// checkPrerequisites() — 简化为确认 D1_TEST_DATABASE_ID 存在
// （main() 已做完 testDbId !== prodDbId 检查，到这里一定已通过）
function checkPrerequisites(): boolean {
  // ... check CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN ...

  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    console.error('❌ D1_TEST_DATABASE_ID not set.');
    return false;
  }
  return true;
}
```

`seed.ts` 的 `d1Credentials()` 同样简化——`main()` 已保证覆盖正确，只需保留 `D1_TEST_DATABASE_ID` 存在性检查。

**改动文件**：
- `scripts/run-api-e2e.ts` — `main()` 添加安全检查（存在性 + 不等性）+ env 覆盖；`checkPrerequisites()` 简化
- `tests/api/helpers/seed.ts` — `d1Credentials()` 简化 guard

#### 4b. L3 Playwright — 主进程 + webServer 子进程都要覆盖

Playwright 有 **2 层**需要覆盖 env 的地方：

1. **主进程 + test worker 进程**（运行 `global-setup.ts` / `global-teardown.ts`，以及 `test.beforeAll` / `test()` / `test.afterAll`）：Playwright 官方文档明确支持在 `globalSetup` 中通过 `process.env.FOO = 'value'` 设置环境变量，test worker 进程可以在 `test()` 中读取这些值（[来源](https://playwright.dev/docs/test-global-setup-teardown)）
2. **webServer 子进程**（Next.js dev server on port 27005）：通过 shell command 启动，不受 `globalSetup` 的 `process.env` 影响

因此，`globalSetup` 中设置的 `process.env` 覆盖可以同时覆盖主进程和 test worker 中的 `executeD1()` 调用。webServer 需要单独通过 shell env 注入。

**改动方案**：

**`tests/playwright/global-setup.ts`** — 在 `loadEnvFile()` 后立即做安全检查 + 覆盖 `process.env`（test worker 可读取）：

```typescript
export default async function globalSetup(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), '.env.local'));

  // ---- 安全检查 + 切换到测试资源 ----
  const prodDbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    throw new Error(
      'D1_TEST_DATABASE_ID not set. Playwright E2E requires a dedicated test database.'
    );
  }
  if (testDbId === prodDbId) {
    throw new Error(
      `D1_TEST_DATABASE_ID === CLOUDFLARE_D1_DATABASE_ID (${prodDbId}). ` +
      'Test DB must differ from production DB.'
    );
  }
  process.env.CLOUDFLARE_D1_DATABASE_ID = testDbId;

  if (process.env.R2_TEST_BUCKET_NAME) {
    process.env.R2_BUCKET_NAME = process.env.R2_TEST_BUCKET_NAME;
  }
  if (process.env.R2_TEST_PUBLIC_DOMAIN !== undefined) {
    process.env.R2_PUBLIC_DOMAIN = process.env.R2_TEST_PUBLIC_DOMAIN;
  }

  // ... ensureTestUser (使用已覆盖的 D1 ID) ...
}
```

**`tests/playwright/helpers/d1.ts`** — 添加安全 guard（确认 env 已被 globalSetup 正确覆盖）：

```typescript
export async function executeD1(sql, params, options): Promise<void> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  // 安全防护：必须有 D1_TEST_DATABASE_ID，且 CLOUDFLARE_D1_DATABASE_ID 已被覆盖
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) throw new Error('D1_TEST_DATABASE_ID not set.');
  if (databaseId !== testDbId) {
    throw new Error(
      `D1 safety: CLOUDFLARE_D1_DATABASE_ID (${databaseId}) !== D1_TEST_DATABASE_ID (${testDbId}). ` +
      'globalSetup should have overridden this. Refusing to operate on non-test database.'
    );
  }

  // ... existing fetch logic ...
}
```

> **为什么 guard 用 `databaseId !== testDbId`**：`globalSetup` 已将 `CLOUDFLARE_D1_DATABASE_ID` 覆盖为 `D1_TEST_DATABASE_ID`，正常流程中两者必然相等。如果不等，说明 globalSetup 覆盖没生效（配置 bug），guard 应拒绝操作。这是防御性检查，不是主要的隔离机制。

`queryD1()` 也需添加同样的 guard。

**`playwright.config.ts`** — webServer 的 env 通过 command 前缀注入（webServer 是独立 shell 进程，不受 globalSetup `process.env` 影响）：

```typescript
webServer: {
  command: [
    `PLAYWRIGHT=1`,
    `AUTH_URL=${E2E_BASE}`,
    `CLOUDFLARE_D1_DATABASE_ID=\${D1_TEST_DATABASE_ID}`,
    `R2_BUCKET_NAME=\${R2_TEST_BUCKET_NAME:-$R2_BUCKET_NAME}`,
    `R2_PUBLIC_DOMAIN=\${R2_TEST_PUBLIC_DOMAIN:-$R2_PUBLIC_DOMAIN}`,
    `bun run next dev --turbopack -p ${E2E_PORT}`,
  ].join(' '),
  url: E2E_BASE,
  reuseExistingServer: false,
  timeout: 60_000,
},
```

> 注意：Playwright `webServer.command` 是 shell string，可直接用 shell 变量展开。`${D1_TEST_DATABASE_ID}` 在 shell 层面读取。

**`tests/playwright/global-teardown.ts`** — 同样做安全检查 + 覆盖：

```typescript
export default async function globalTeardown(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), '.env.local'));

  // 安全检查 + 切换到测试库（与 global-setup 相同）
  const prodDbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    throw new Error('D1_TEST_DATABASE_ID not set.');
  }
  if (testDbId === prodDbId) {
    throw new Error('D1_TEST_DATABASE_ID === CLOUDFLARE_D1_DATABASE_ID. Refusing teardown on prod.');
  }
  process.env.CLOUDFLARE_D1_DATABASE_ID = testDbId;

  // ... cleanup (使用已覆盖的 D1 ID) ...
}
```

**改动文件**：
- `tests/playwright/global-setup.ts` — 安全检查（存在性 + 不等性）+ env 覆盖（传播到 test worker）
- `tests/playwright/global-teardown.ts` — 安全检查 + env 覆盖
- `tests/playwright/helpers/d1.ts` — `executeD1()` 和 `queryD1()` 添加防御性 guard
- `playwright.config.ts` — webServer command 注入测试 env

#### 4c. R2 — bucket name + public domain 都需要覆盖

应用代码中 3 处使用 `R2_PUBLIC_DOMAIN` 构造最终 URL：

| 文件 | 行 | 代码 | 空字符串行为 |
|------|-----|------|-------------|
| `actions/upload.ts` | 50-52 | `if (!publicDomain)` return error | ❌ 报错（空字符串 falsy） |
| `actions/links.ts` | 518-520 | `if (!publicDomain)` return error | ❌ 报错（空字符串 falsy） |
| `app/api/tmp/upload/[token]/route.ts` | 111 | `process.env.R2_PUBLIC_DOMAIN \|\| "https://s.zhe.to"` | ❌ 回退到生产域名（空字符串 falsy） |

**结论**：`R2_TEST_PUBLIC_DOMAIN` 不能设为空字符串——两处 server action 会报错终止，临时上传 route 则会静默回退到生产域名 `https://s.zhe.to`。

**方案**：使用占位域名 `https://test-r2.zhe.to`（不需要真正配置 DNS，仅作为 URL 前缀；测试中不会真正通过浏览器访问这些 URL——L2 不测试上传，L3 上传被 `page.route()` mock 拦截）：

```bash
# .env.local
R2_TEST_PUBLIC_DOMAIN=https://test-r2.zhe.to    # 占位域名，不需要实际 DNS
```

这样：
- `actions/upload.ts` / `actions/links.ts`：`!publicDomain` 为 false → 正常生成 URL（指向测试占位域名）
- `route.ts:111`：`process.env.R2_PUBLIC_DOMAIN || ...` → 使用 `https://test-r2.zhe.to`，不会回退到生产域名
- 所有生成的 URL 形如 `https://test-r2.zhe.to/xxx`，明显区别于生产 `https://s.zhe.to/xxx`
- 不需要改动应用代码

> **如果未来需要真正验证 R2 上传 URL 可访问性**（如 L3 测试检查图片加载），再配置 `test-r2.zhe.to` 的 DNS → `zhe-test` bucket。当前阶段不需要。

覆盖逻辑已包含在 4a（`run-api-e2e.ts` 的 `main()`）和 4b（`global-setup.ts` / `global-teardown.ts` / `d1.ts` / `playwright.config.ts`）中。

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

### Step 5: 创建 `.env.example`

> 仓库当前没有 `.env.example` 文件（`docs/02-getting-started.md:25` 引用了它但实际不存在）。此步骤创建该文件。

```bash
# ─── Required ────────────────────────────────────────────────────────────────
AUTH_SECRET=                      # openssl rand -base64 32
AUTH_GOOGLE_ID=                   # Google Cloud Console
AUTH_GOOGLE_SECRET=               # Google Cloud Console
CLOUDFLARE_ACCOUNT_ID=            # Cloudflare Dashboard
CLOUDFLARE_D1_DATABASE_ID=        # zhe-db UUID
CLOUDFLARE_API_TOKEN=             # Cloudflare API Token

# ─── Optional: File Upload (R2) ──────────────────────────────────────────────
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=                      # https://<account_id>.r2.cloudflarestorage.com
R2_BUCKET_NAME=zhe
R2_PUBLIC_DOMAIN=                 # https://s.zhe.to
R2_USER_HASH_SALT=

# ─── Optional: Security ─────────────────────────────────────────────────────
WORKER_SECRET=                    # Shared secret for sync-kv and record-click endpoints

# ─── Test Resources (required for L2/L3 E2E tests) ──────────────────────────
D1_TEST_DATABASE_ID=              # zhe-db-test UUID (must NOT equal CLOUDFLARE_D1_DATABASE_ID)
R2_TEST_BUCKET_NAME=zhe-test
R2_TEST_PUBLIC_DOMAIN=https://test-r2.zhe.to  # Placeholder domain (no real DNS needed)
KV_TEST_NAMESPACE_ID=             # zhe-test KV namespace ID
```

### Step 6: 更新文档

- `docs/02-getting-started.md` — 添加测试资源创建步骤，确认 `.env.example` 引用正确
- `docs/05-testing.md` — 添加测试隔离说明
- `CLAUDE.md` — 添加环境隔离注意事项

---

## 五、原子化提交

| # | Commit | 内容 | 涉及文件 |
|---|--------|------|----------|
| 1 | `feat: create test D1, R2, KV resources` | CLI 创建资源，记录 UUID/ID 到本文档 | `docs/14-*` |
| 2 | `feat: initialize zhe-db-test schema` | 对测试 D1 执行全部迁移 | — (CLI only) |
| 3 | `fix: isolate L2 env to use test D1/R2 resources` | `main()` 覆盖 env；`checkPrerequisites()` + `seed.ts` 简化 guard | `scripts/run-api-e2e.ts`, `tests/api/helpers/seed.ts` |
| 4 | `fix: isolate L3 env to use test D1/R2 resources` | global-setup/teardown 覆盖 env；d1.ts 添加 guard；playwright.config.ts webServer env | `tests/playwright/global-setup.ts`, `tests/playwright/global-teardown.ts`, `tests/playwright/helpers/d1.ts`, `playwright.config.ts` |
| 5 | `feat: add KV test namespace support` | 测试环境使用 `KV_TEST_NAMESPACE_ID` | `lib/kv/client.ts` |
| 6 | `feat: create .env.example with test resource vars` | 新建 `.env.example` | `.env.example` |
| 7 | `docs: update getting-started and testing docs for test isolation` | 更新文档引用 | `docs/02-*`, `docs/05-*`, `CLAUDE.md` |

---

## 六、验证清单

- [ ] `zhe-db-test` D1 数据库已创建，UUID 已记录
- [ ] `zhe-test` R2 bucket 已创建
- [ ] `zhe-test` KV namespace 已创建，ID 已记录
- [ ] `zhe-db-test` schema 已初始化（全部迁移执行完毕）
- [ ] `.env.local` 中 `D1_TEST_DATABASE_ID` 指向 `zhe-db-test`（**不等于** `CLOUDFLARE_D1_DATABASE_ID`）
- [ ] `bun run test:api` Phase 1 通过（seed.ts 使用 `zhe-db-test`）
- [ ] `bun run test:api` Phase 2 通过（dev server 连接 `zhe-db-test` + `zhe-test` bucket）
- [ ] `bun run test:e2e:pw` 通过（global-setup/teardown 使用 `zhe-db-test`；webServer 使用 `zhe-db-test` + `zhe-test` bucket）
- [ ] 运行测试前后，`zhe-db` 生产数据无变化（通过 D1 HTTP API 查询验证）
- [ ] `tests/playwright/helpers/d1.ts` 的 `executeD1()` 和 `queryD1()` 有防御性 guard（`databaseId !== testDbId` 时拒绝操作）
- [ ] `.env.example` 存在且包含所有生产+测试 env var
- [ ] `R2_TEST_PUBLIC_DOMAIN` 为 `https://test-r2.zhe.to`，测试中生成的 URL 不指向 `s.zhe.to`

---

## 相关文档

- [环境搭建](02-getting-started.md)
- [测试策略](05-testing.md)
- [质量体系升级](13-quality-system-upgrade.md)
- [部署与配置](06-deployment.md)
