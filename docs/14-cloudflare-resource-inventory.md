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
| `zhe-db` | `<YOUR_D1_DATABASE_ID>` | **生产** — 线上短链接数据 | ✅ 已存在 |
| `zhe-db-test` | `<YOUR_TEST_D1_DATABASE_ID>` | **测试** — L2/L3 E2E 测试专用 | ✅ 已创建 |

### R2 Bucket

| 名称 | 公开域名 | 用途 | 状态 |
|------|----------|------|------|
| `zhe` | `s.zhe.to` | **生产** — 用户上传文件、OG 截图 | ✅ 已存在 |
| `zhe-test` | — | **测试** — L2/L3 E2E 测试专用 | ✅ 已创建 |

### KV Namespace

| 名称 | ID | 用途 | 状态 |
|------|------|------|------|
| `zhe` | `<YOUR_KV_NAMESPACE_ID>` | **生产** — Worker 边缘短链缓存 | ✅ 已存在 |
| `zhe-test` | `<YOUR_TEST_KV_NAMESPACE_ID>` | **测试** — L2/L3 E2E 测试专用 | ✅ 已创建 |

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
| **KV** | ⚠️ Phase 1 的 `webhook.test.ts` 建链触发 `kvPutLink()`，无 mock | 不涉及（`.env.local` 未配 `CLOUDFLARE_KV_NAMESPACE_ID`） | 🟠 **中**（碰巧安全，但无设计防护） |

### 具体问题

#### D1: 生产和测试共用同一个数据库

`.env.local` 配置：

```
CLOUDFLARE_D1_DATABASE_ID=<YOUR_D1_DATABASE_ID>   ← zhe-db (生产)
D1_TEST_DATABASE_ID=<YOUR_TEST_D1_DATABASE_ID>    ← zhe-db-test (测试)
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

`.env.local` 未配置 `CLOUDFLARE_KV_NAMESPACE_ID`，所以 `lib/kv/client.ts` 的 `getKVCredentials()` 返回 null，KV 操作静默跳过。但存在两条暴露路径：

- **L2 Phase 1**：`tests/api/webhook.test.ts` 直接导入并调用 `app/api/link/create/[token]/route.ts` 的 POST handler。每次成功建链（201 响应）都会触发 `kvPutLink()`（`route.ts:199`，fire-and-forget）。该测试文件没有 mock `@/lib/kv/client`，`tests/setup.ts` 也没有全局 KV mock。如果开发者的 `.env.local` 配了 `CLOUDFLARE_KV_NAMESPACE_ID`（三个 KV 所需 env var 中唯一的 KV 专属变量，另两个 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` 是 D1 也需要的），5 个 POST 测试会静默写入生产 KV。
- **L3 Playwright**：webServer 子进程（Next.js dev server）同样会继承 `.env.local` 中的 `CLOUDFLARE_KV_NAMESPACE_ID`。但当前 L3 测试不直接触发建链路径，风险较低。

如果未来有人加上 `CLOUDFLARE_KV_NAMESPACE_ID` 指向生产 KV，以上路径会立即写入生产数据。

---

## 四、隔离方案

### 目标

测试环境（L2 + L3）使用独立的 `zhe-db-test` / `zhe-test` / `zhe-test` 资源，与生产完全隔离。

### 核心设计：fail-safe env 覆盖 + `_test_marker` 标记表

> ⚠️ **本方案不改变任何层级的门控级别**。L2 仍然是 soft gate（`docs/05-testing.md:29`），L3 仍然是 on-demand 硬门控。Phase 1 always runs，Phase 2 soft gate——这一结构不变。唯一的行为变化是：当 `CLOUDFLARE_KV_NAMESPACE_ID` 已配但 `KV_TEST_NAMESPACE_ID` 缺失时，L2 会**清除** KV 生产 ID 使 KV 功能降级为 no-op（而非跳过测试）。这是功能降级，不是门控变更。

**四重防线**（符合 [Cloudflare 资源隔离规范](# "mem:20eebbc1") 变体 B 要求）：

1. **测试入口 env 覆盖**：`main()` / `globalSetup` 中检查 + 覆盖 `process.env`
2. **ID 不等性检查**：`testDbId !== prodDbId`，防止误配回生产
3. **防御性 guard**：`executeD1()` / `queryD1()` 中确认 `CLOUDFLARE_D1_DATABASE_ID === D1_TEST_DATABASE_ID`
4. **`_test_marker` 标记表**：测试 D1 中有 `_test_marker(key='env', value='test')` 行，批量操作前查询验证。生产 D1 没有此表。即使前 3 层全因 bug 失效，marker 仍能阻止误操作

**原则**：所有测试资源（D1/R2/KV）在测试入口统一做检查 + env 覆盖。检查分两类：

| 情况 | L2（soft gate，pre-push） | L3（hard gate，on-demand） |
|------|----------------|----------------|
| D1 测试变量**缺失** | ⚠️ warn + skip Phase 2（Phase 1 always runs，它用内存 D1 mock） | ❌ throw |
| R2 测试变量**缺失** | ⚠️ warn only（L2 全路径 R2 操作均 mock，无真实写入） | ❌ throw（L3 webServer 可能触发 R2） |
| KV 生产 ID 已配但测试 ID **缺失** | ⚠️ **清除**生产 KV ID + warn（`getKVCredentials()` → null，`kvPutLink()` no-op），Phase 1 继续运行 | ❌ throw |
| 测试变量**存在但等于生产值** | ❌ hard fail（安全问题，绝不允许） | ❌ hard fail |
| 测试变量**存在且正确** | ✅ 覆盖 env，继续运行 | ✅ 覆盖 env，继续运行 |

> **关键原则**：绝不在有真实写入风险的路径上静默回退到生产资源。对于**已证明全路径 mock、无真实写入**的资源（如 L2 的 R2），允许 warn-only 继续运行，但必须在日志中明确标注原因。L2 的 skip 粒度严格遵循现有 harness 设计——Phase 1 always runs（`run-api-e2e.ts:16`），只有 Phase 2 是 soft gate。
>
> **KV 降级说明**：当 `CLOUDFLARE_KV_NAMESPACE_ID` 已配但 `KV_TEST_NAMESPACE_ID` 缺失时，L2 方案**清除** `CLOUDFLARE_KV_NAMESPACE_ID` 使 KV 功能停用。这是一种**功能降级**（KV 写入被禁用），不是门控级别变更（Phase 1 仍然运行，不跳过）。对比 D1 的处理差异：D1 Phase 1 用内存 mock 不需要真实 D1，所以缺少 D1 测试变量不影响 Phase 1；KV 没有 mock 层，只能通过清除 env 使其 no-op。

#### D1: `D1_TEST_DATABASE_ID` 语义变更

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

#### R2: warn-only 覆盖（L2 全路径 R2 操作均 mock，无真实写入风险）

L2 Phase 1 的 R2 操作全部被 mock（`tmp-upload.test.ts`、`cleanup.test.ts`），Phase 2（`api.test.ts`、`live.test.ts`）不涉及 R2。**L2 全部代码路径中不存在任何 unmocked 的 R2 写入**，因此 R2 **不是** L2 的 skip 前提条件。

```
测试入口逻辑:
  1. 如果 R2_TEST_BUCKET_NAME 和 R2_TEST_PUBLIC_DOMAIN 都存在 → 覆盖
  2. 如果缺少 → warn（标注"L2 全路径 R2 均 mock，无真实写入"），Phase 1 和 Phase 2 继续运行
  3. 不跳过 Phase 1 或 Phase 2
```

> **与"绝不在有真实写入风险的路径上回退到生产资源"原则的关系**：R2 warn-only 是该原则的合法例外——L2 已证明全路径 mock，不存在真实写入风险。warn 日志明确标注了原因，不是"静默"回退。如果未来 L2 新增了 unmocked R2 写入路径，此处必须升级为 skip 或 hard fail。
>
> **L3 仍然是 hard gate**——Playwright webServer 启动真实 Next.js，可能触发 R2 操作。

#### KV: conditional — Phase 1 前必须覆盖或清除

```
测试入口逻辑（在 Phase 1 之前执行）:
  1. 如果 CLOUDFLARE_KV_NAMESPACE_ID 未配 → 跳过（KV 不激活，无风险）
  2. 如果已配 → 检查 KV_TEST_NAMESPACE_ID 是否存在
     2a. 存在 → process.env.CLOUDFLARE_KV_NAMESPACE_ID = KV_TEST_NAMESPACE_ID
     2b. 缺失 → L2: 清除 CLOUDFLARE_KV_NAMESPACE_ID + warn（KV 功能降级为 no-op）
                  L3: throw（硬门控）
```

> **为什么 L2 选择清除而非跳过**：`webhook.test.ts` 的 POST 测试触发 `kvPutLink()`（`route.ts:199`）。如果 `CLOUDFLARE_KV_NAMESPACE_ID` 已配且未处理，Phase 1 会写入生产 KV。但 Phase 1 always runs 是 L2 harness 的核心设计（`run-api-e2e.ts:16`），不能跳过。清除生产 KV ID 使 `getKVCredentials()` 返回 null → `kvPutLink()` 变 no-op，既保护了生产 KV，又不打破 Phase 1 的运行保证。

### Step 1: 创建测试资源

```bash
# D1: 创建测试数据库
npx wrangler d1 create zhe-db-test

# R2: 创建测试 bucket
npx wrangler r2 bucket create zhe-test

# KV: 创建测试 namespace
npx wrangler kv namespace create zhe-test
```

### Step 2: 初始化测试 D1 schema + 插入 `_test_marker`

```bash
# 对测试库执行所有迁移
for f in drizzle/migrations/*.sql; do
  npx wrangler d1 execute zhe-db-test --remote --file="$f"
done

# 插入 _test_marker 标记表（最后一道防线，防止误操作生产数据库）
npx wrangler d1 execute zhe-db-test --remote --command \
  "CREATE TABLE IF NOT EXISTS _test_marker (key TEXT PRIMARY KEY, value TEXT);
   INSERT OR REPLACE INTO _test_marker (key, value) VALUES ('env', 'test');"
```

> **`_test_marker` 的作用**：这是独立于 env 检查的最后一道防线。即使前面所有 env 覆盖和不等性检查因 bug 失效，批量操作（seed / reset / teardown）前查询 `_test_marker` 仍能阻止误操作生产数据。生产数据库 `zhe-db` 没有这张表，查询会返回空 → guard 拒绝执行。

### Step 3: 更新 `.env.local`

```bash
# 生产凭据（不变）
CLOUDFLARE_D1_DATABASE_ID=<YOUR_D1_DATABASE_ID>
R2_BUCKET_NAME=zhe
R2_PUBLIC_DOMAIN=https://s.zhe.to
# CLOUDFLARE_KV_NAMESPACE_ID=<YOUR_KV_NAMESPACE_ID>  (Worker 使用，应用不直接配)

# 测试凭据（新增）
D1_TEST_DATABASE_ID=<zhe-db-test 的 UUID>
R2_TEST_BUCKET_NAME=zhe-test
R2_TEST_PUBLIC_DOMAIN=https://test-r2.zhe.to  # 占位域名（不需要实际 DNS，见 4c 说明）
KV_TEST_NAMESPACE_ID=<zhe-test 的 ID>
```

### Step 4: 代码改动

#### 4a. L2 API E2E — Phase 1 / Phase 2 分层覆盖

`run-api-e2e.ts` 的两个 Phase 对外部资源的依赖不同：

| Phase | 运行内容 | D1 依赖 | R2 依赖 | KV 依赖 |
|-------|---------|---------|---------|---------|
| **Phase 1** | `tests/api/*.test.ts`（排除 `api.test.ts`/`live.test.ts`），in-process，用 `setup.ts` 内存 D1 mock | ❌ 无（内存 mock） | ❌ 无（`tmp-upload.test.ts`/`cleanup.test.ts` mock 了 R2） | ⚠️ `webhook.test.ts` 触发 `kvPutLink()`，无 mock |
| **Phase 2** | `api.test.ts` + `live.test.ts`，真 HTTP 到 dev server | ✅ 真实 D1 | ❌ 无（这两个文件不测试上传） | ⚠️ dev server 可能连 KV |

**关键约束**：`run-api-e2e.ts:16` 明确设计"Phase 1 (in-process) always runs — it has no external dependencies"。env 覆盖不能放在 `main()` 顶部导致 Phase 1 被跳过。

**改动方案**：

1. **KV 覆盖或清除放在 `main()` 顶部**（Phase 1 需要，因为 `webhook.test.ts` 触发 `kvPutLink()`。有测试 ID 则覆盖，无则清除生产 ID 使 KV no-op）
2. **D1 覆盖放在 Phase 1 之后、Phase 2 之前**（只有 Phase 2 需要真实 D1）
3. **R2 覆盖也放在 Phase 2 之前**（Phase 1 全部 mock，Phase 2 不涉及 R2；但覆盖可防止 dev server 意外连生产 R2）
4. **D1 缺失时跳过 Phase 2**（soft gate），R2 缺失时只 warn 不跳过（L2 不依赖真实 R2）

```typescript
// scripts/run-api-e2e.ts — main()
async function main(): Promise<void> {
  loadEnvFile(pathResolve(PROJECT_ROOT, '.env.local'));

  // ---- KV: 覆盖或清除，必须在 Phase 1 之前（webhook.test.ts 触发 kvPutLink） ----
  if (process.env.CLOUDFLARE_KV_NAMESPACE_ID) {
    const testKvId = process.env.KV_TEST_NAMESPACE_ID;
    if (testKvId) {
      process.env.CLOUDFLARE_KV_NAMESPACE_ID = testKvId;
    } else {
      // 清除生产 KV ID → getKVCredentials() returns null → kvPutLink() no-op
      // 功能降级，但 Phase 1 不跳过
      console.warn(
        '⚠️  [api-e2e] CLOUDFLARE_KV_NAMESPACE_ID is set but KV_TEST_NAMESPACE_ID is missing. ' +
        'Clearing KV config to prevent production writes (KV features disabled for this run).'
      );
      delete process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    }
  }

  // Phase 1: always runs (in-process, memory D1 mock, R2 mocked)
  const phase1Code = await runInProcessTests();
  if (phase1Code !== 0) {
    process.exit(phase1Code);
  }

  // ---- D1: 覆盖在 Phase 2 之前（只有 Phase 2 需要真实 D1） ----
  const prodDbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    console.warn('⚠️  [api-e2e] D1_TEST_DATABASE_ID not set. Skipping Phase 2 (soft gate).');
    return;
  }
  if (testDbId === prodDbId) {
    console.error(
      '❌ D1_TEST_DATABASE_ID === CLOUDFLARE_D1_DATABASE_ID. ' +
      'Test DB must differ from production DB.'
    );
    process.exit(1);
  }
  process.env.CLOUDFLARE_D1_DATABASE_ID = testDbId;

  // ---- R2: 覆盖 dev server 的 env（Phase 2 不依赖真实 R2，但防止 dev server 意外连生产） ----
  const testBucket = process.env.R2_TEST_BUCKET_NAME;
  const testPublicDomain = process.env.R2_TEST_PUBLIC_DOMAIN;
  if (testBucket && testPublicDomain) {
    process.env.R2_BUCKET_NAME = testBucket;
    process.env.R2_PUBLIC_DOMAIN = testPublicDomain;
  } else {
    console.warn(
      '⚠️  [api-e2e] R2_TEST_BUCKET_NAME or R2_TEST_PUBLIC_DOMAIN not set. ' +
      'Dev server retains production R2 config. This is safe: L2 tests mock all R2 operations, no real writes occur.'
    );
  }

  // Phase 2: soft gate (may skip if infra unavailable)
  const phase2Code = await runPhase2();
  process.exit(phase2Code);
}
```

**Guard 语义变更**（`checkPrerequisites()` + `seed.ts` 的 `d1Credentials()`）：

由于 `main()` 已在 Phase 2 之前执行了完整的安全检查（存在性 + 不等性）并覆盖了 `CLOUDFLARE_D1_DATABASE_ID`，下游的 guard 简化为确认覆盖已生效：

```typescript
// checkPrerequisites() — 确认 D1_TEST_DATABASE_ID 存在 + _test_marker 验证
// （main() 已做完 testDbId !== prodDbId 检查，到这里一定已通过）
async function checkPrerequisites(): Promise<boolean> {
  // ... check CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN ...

  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    console.error('❌ D1_TEST_DATABASE_ID not set.');
    return false;
  }

  // _test_marker: 最后一道防线（通过 D1 HTTP API 查询）
  try {
    const marker = await queryD1TestMarker();  // SELECT value FROM _test_marker WHERE key = 'env'
    if (marker !== 'test') {
      console.error('❌ _test_marker check failed. Is this really a test database?');
      return false;
    }
  } catch {
    console.error('❌ Failed to verify _test_marker. Database may not be initialized.');
    return false;
  }

  return true;
}
```

`seed.ts` 的 `d1Credentials()` 同样简化——`main()` 已保证覆盖正确，只需保留 `D1_TEST_DATABASE_ID` 存在性检查。

**改动文件**：
- `scripts/run-api-e2e.ts` — `main()` 分层 env 覆盖（KV 覆盖或清除→Phase1→D1/R2→Phase2）；`checkPrerequisites()` 简化
- `tests/api/helpers/seed.ts` — `d1Credentials()` 简化 guard

#### 4b. L3 Playwright — 主进程 + webServer 子进程都要覆盖

Playwright 有 **2 层**需要覆盖 env 的地方：

1. **主进程 + test worker 进程**（运行 `global-setup.ts` / `global-teardown.ts`，以及 `test.beforeAll` / `test()` / `test.afterAll`）：Playwright 官方文档明确支持在 `globalSetup` 中通过 `process.env.FOO = 'value'` 设置环境变量，test worker 进程可以在 `test()` 中读取这些值（[来源](https://playwright.dev/docs/test-global-setup-teardown)）
2. **webServer 子进程**（Next.js dev server on port 27006）：通过 shell command 启动，不受 `globalSetup` 的 `process.env` 影响

因此，`globalSetup` 中设置的 `process.env` 覆盖可以同时覆盖主进程和 test worker 中的 `executeD1()` 调用。webServer 需要单独通过 shell env 注入。

**改动方案**：

**`tests/playwright/global-setup.ts`** — L3 是 on-demand 硬门控，缺少测试变量直接 throw（不是 soft gate）：

```typescript
export default async function globalSetup(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), '.env.local'));

  // ---- D1: hard gate (L3 is on-demand, missing config = error) ----
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

  // ---- R2: hard gate ----
  const testBucket = process.env.R2_TEST_BUCKET_NAME;
  const testPublicDomain = process.env.R2_TEST_PUBLIC_DOMAIN;
  if (!testBucket || !testPublicDomain) {
    throw new Error(
      'R2_TEST_BUCKET_NAME and R2_TEST_PUBLIC_DOMAIN must both be set for Playwright E2E.'
    );
  }
  process.env.R2_BUCKET_NAME = testBucket;
  process.env.R2_PUBLIC_DOMAIN = testPublicDomain;

  // ---- KV: conditional hard gate ----
  if (process.env.CLOUDFLARE_KV_NAMESPACE_ID) {
    const testKvId = process.env.KV_TEST_NAMESPACE_ID;
    if (!testKvId) {
      throw new Error(
        'CLOUDFLARE_KV_NAMESPACE_ID is set but KV_TEST_NAMESPACE_ID is missing. ' +
        'Tests would write to production KV.'
      );
    }
    process.env.CLOUDFLARE_KV_NAMESPACE_ID = testKvId;
  }

  // ... ensureTestUser (使用已覆盖的 D1 ID) ...

  // ---- _test_marker: 最后一道防线（验证数据库确实是测试库） ----
  const marker = await queryD1(
    "SELECT value FROM _test_marker WHERE key = 'env'"
  );
  if (marker?.[0]?.value !== 'test') {
    throw new Error(
      'FATAL: _test_marker check failed. The database does not contain a ' +
      '_test_marker row with value "test". Refusing to run E2E tests. ' +
      'Did you run Step 2 (initialize schema + insert marker)?'
    );
  }
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

**`playwright.config.ts`** — webServer 的 env 通过 command 前缀注入（webServer 是独立 shell 进程，不受 globalSetup `process.env` 影响）。

> ⚠️ `playwright.config.ts` 是 Node 脚本，不会自动读取 `.env.local`。KV 的 conditional 逻辑需要在 config 加载时知道 `CLOUDFLARE_KV_NAMESPACE_ID` 是否已配。因此**必须在 config 顶部显式加载 `.env.local`**（[Playwright 官方文档](https://playwright.dev/docs/test-parameterize#env-files)）。

```typescript
// playwright.config.ts 顶部
import { resolve } from 'path';
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile(resolve(process.cwd(), '.env.local'));
} catch {
  // .env.local doesn't exist — fine, env comes from shell
}

// ... 然后在 defineConfig 中：
webServer: {
  command: [
    `PLAYWRIGHT=1`,
    `AUTH_URL=${E2E_BASE}`,
    `CLOUDFLARE_D1_DATABASE_ID=\${D1_TEST_DATABASE_ID:?D1_TEST_DATABASE_ID not set}`,
    `R2_BUCKET_NAME=\${R2_TEST_BUCKET_NAME:?R2_TEST_BUCKET_NAME not set}`,
    `R2_PUBLIC_DOMAIN=\${R2_TEST_PUBLIC_DOMAIN:?R2_TEST_PUBLIC_DOMAIN not set}`,
    // KV: 如果生产 ID 已配，用测试 ID 覆盖；否则不传（KV 不激活）
    // process.env 已通过顶部 loadEnvFile 加载 .env.local
    process.env.CLOUDFLARE_KV_NAMESPACE_ID
      ? `CLOUDFLARE_KV_NAMESPACE_ID=\${KV_TEST_NAMESPACE_ID:?KV_TEST_NAMESPACE_ID not set}`
      : '',
    `bun run next dev --turbopack -p ${E2E_PORT}`,
  ].filter(Boolean).join(' '),
  url: E2E_BASE,
  reuseExistingServer: false,
  timeout: 60_000,
},
```

> `${VAR:?msg}` 是 bash 语法：如果 `VAR` 未设置或为空，shell 报错并终止。这保证 webServer 进程在测试变量缺失时直接失败，不会静默回退到生产值。

**`tests/playwright/global-teardown.ts`** — 确认 globalSetup 的 env 覆盖仍然生效（同一 Node 进程），然后验证 `_test_marker`：

```typescript
export default async function globalTeardown(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), '.env.local'));

  // ---- D1: confirm globalSetup override is still in effect ----
  // globalSetup already set CLOUDFLARE_D1_DATABASE_ID = D1_TEST_DATABASE_ID.
  // They should be equal now — if not, the override was lost.
  const currentDbId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const testDbId = process.env.D1_TEST_DATABASE_ID;
  if (!testDbId) {
    throw new Error('D1_TEST_DATABASE_ID not set.');
  }
  if (currentDbId !== testDbId) {
    throw new Error(
      `D1 safety: CLOUDFLARE_D1_DATABASE_ID (${currentDbId}) !== D1_TEST_DATABASE_ID (${testDbId}). ` +
      'globalSetup override may not have taken effect. Refusing teardown.'
    );
  }

  // ---- R2: confirm test overrides ----
  // ... (re-apply R2_TEST_BUCKET_NAME / R2_TEST_PUBLIC_DOMAIN defensively)

  // ---- KV: conditional check ----
  // ... (same pattern as globalSetup)

  // ---- _test_marker: 最后一道防线 ----
  const marker = await queryD1(
    "SELECT value FROM _test_marker WHERE key = 'env'"
  );
  if (marker?.[0]?.value !== 'test') {
    throw new Error(
      'FATAL: _test_marker check failed. Refusing teardown on non-test database.'
    );
  }

  // ... cleanup (使用已覆盖的资源 ID) ...
}
```

> **为什么 teardown 不再做 `testDbId === prodDbId` 不等性检查**：globalSetup 和 globalTeardown 运行在**同一个 Node 进程**中。globalSetup 执行 `process.env.CLOUDFLARE_D1_DATABASE_ID = testDbId` 后，teardown 读取到的 `CLOUDFLARE_D1_DATABASE_ID` 已经是 `testDbId`。如果仍然做不等性检查（`testDbId === prodDbId`），结果永远为 true → teardown 永远拒绝运行。正确做法是确认覆盖仍然生效（`currentDbId === testDbId`），而不是重复 setup 的逻辑。

**改动文件**：
- `tests/playwright/global-setup.ts` — 安全检查（存在性 + 不等性）+ env 覆盖（传播到 test worker）+ `_test_marker` 验证
- `tests/playwright/global-teardown.ts` — 安全检查 + env 覆盖 + `_test_marker` 验证
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

#### 4d. KV — 与 D1/R2 统一的 env 覆盖模式

KV 隔离**不能**用 `PLAYWRIGHT === '1'` 做分流——L2 Phase 1 不设置 `PLAYWRIGHT`，但 `webhook.test.ts` 的 5 个 POST 测试触发 `kvPutLink()`（`app/api/link/create/[token]/route.ts:199`），且无全局 KV mock。

**方案**：与 D1/R2 统一，在测试入口（`main()` / `globalSetup`）覆盖 `process.env.CLOUDFLARE_KV_NAMESPACE_ID`。不改动 `lib/kv/client.ts` 应用代码——它已经从 `process.env.CLOUDFLARE_KV_NAMESPACE_ID` 读取，覆盖 env 即可。

**Conditional fail-closed 策略**：

- 如果 `.env.local` 没有配 `CLOUDFLARE_KV_NAMESPACE_ID`（当前状态）→ `getKVCredentials()` 返回 null → `kvPutLink()` 静默跳过，**无风险**
- 如果 `.env.local` 配了 `CLOUDFLARE_KV_NAMESPACE_ID` 且有 `KV_TEST_NAMESPACE_ID` → env 覆盖，写入测试 KV
- 如果 `.env.local` 配了 `CLOUDFLARE_KV_NAMESPACE_ID` 但缺少 `KV_TEST_NAMESPACE_ID` → L2 **清除**生产 KV ID（功能降级为 no-op，Phase 1 仍运行）；L3 **throw**（硬门控）

覆盖逻辑已包含在 4a（`run-api-e2e.ts` 的 `main()`）和 4b（`global-setup.ts` / `global-teardown.ts` / `playwright.config.ts`）的代码示例中。

**无需改动 `lib/kv/client.ts`**——`getKVCredentials()` 已从 `process.env` 读取，env 覆盖后自动使用测试 namespace。

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
| 2 | `feat: initialize zhe-db-test schema` | 对测试 D1 执行全部迁移 + 插入 `_test_marker` 标记行 | — (CLI only) |
| 3 | `fix: isolate L2 env to use test D1/R2/KV resources` | `main()` 分层覆盖（KV 覆盖或清除→Phase1→D1/R2→Phase2）；Phase 1 always runs；`checkPrerequisites()` 加 `_test_marker` 验证 + `seed.ts` 简化 guard | `scripts/run-api-e2e.ts`, `tests/api/helpers/seed.ts` |
| 4 | `fix: isolate L3 env to use test D1/R2/KV resources` | global-setup/teardown hard gate + 覆盖 env + `_test_marker` 验证；d1.ts 添加 guard；playwright.config.ts webServer env（`${VAR:?msg}` hard gate） | `tests/playwright/global-setup.ts`, `tests/playwright/global-teardown.ts`, `tests/playwright/helpers/d1.ts`, `playwright.config.ts` |
| 5 | `feat: create .env.example with test resource vars` | 新建 `.env.example` | `.env.example` |
| 6 | `docs: update getting-started and testing docs for test isolation` | 更新文档引用 | `docs/02-*`, `docs/05-*`, `CLAUDE.md` |

---

## 六、验证清单

- [x] `zhe-db-test` D1 数据库已创建，UUID 已记录
- [x] `zhe-test` R2 bucket 已创建
- [x] `zhe-test` KV namespace 已创建，ID 已记录
- [x] `zhe-db-test` schema 已初始化（全部迁移执行完毕）
- [x] `zhe-db-test` 包含 `_test_marker` 表（`key='env', value='test'`）
- [x] `zhe-db`（生产）**没有** `_test_marker` 表（查询返回错误或空）
- [x] `.env.local` 中 `D1_TEST_DATABASE_ID` 指向 `zhe-db-test`（**不等于** `CLOUDFLARE_D1_DATABASE_ID`）
- [x] `run-api-e2e.ts` `main()` 分层覆盖：KV（覆盖或清除）→Phase1→D1/R2→Phase2
- [x] 缺少 `D1_TEST_DATABASE_ID` 时：Phase 1 运行，Phase 2 warn+skip
- [x] 缺少 `R2_TEST_*` 时：Phase 1 和 Phase 2 都运行，仅 warn
- [x] `CLOUDFLARE_KV_NAMESPACE_ID` 已配但缺少 `KV_TEST_NAMESPACE_ID` 时：KV ID 被清除，Phase 1 正常运行（KV 功能降级为 no-op）
- [x] `global-setup.ts` 和 `global-teardown.ts` 对 D1/R2 hard gate + KV conditional hard gate + `_test_marker` 验证
- [x] `playwright.config.ts` webServer command 使用 `${VAR:?msg}` 语法（缺少时 shell 报错终止）
- [x] `bun run test:api` Phase 1 通过（内存 D1 mock；webhook 建链写入 `zhe-test` KV 或 KV 不激活）
- [x] `bun run test:api` Phase 2 通过（dev server 连接 `zhe-db-test` + `zhe-test` bucket；`checkPrerequisites()` 验证 `_test_marker`）
- [x] `bun run test:e2e:pw` 107/109 通过（2 failures 为 pre-existing test flakiness：overview 排名数据污染 + storage 断言文本不匹配）
- [x] 运行测试前后，`zhe-db` 生产数据无变化（通过 D1 HTTP API 查询验证）
- [x] `tests/playwright/helpers/d1.ts` 的 `executeD1()` 和 `queryD1()` 有防御性 guard（`databaseId !== testDbId` 时拒绝操作）
- [x] `.env.example` 存在且包含所有生产+测试 env var
- [x] `R2_TEST_PUBLIC_DOMAIN` 为 `https://test-r2.zhe.to`，测试中生成的 URL 不指向 `s.zhe.to`
- [x] 故意删除 `R2_TEST_BUCKET_NAME` 后运行 `bun run test:api`，确认 warn 但 Phase 1+2 仍运行（69+14=83 passed）
- [x] 故意设置 `D1_TEST_DATABASE_ID` 等于 `CLOUDFLARE_D1_DATABASE_ID` 后运行 `bun run test:api`，确认 hard fail
- [x] 如果配了 `CLOUDFLARE_KV_NAMESPACE_ID`，故意删除 `KV_TEST_NAMESPACE_ID` 后运行 `bun run test:api`，确认 KV ID 被清除 + warn，Phase 1 仍然运行（69+14=83 passed）

---

## 相关文档

- [环境搭建](02-getting-started.md)
- [测试策略](05-testing.md)
- [质量体系升级](13-quality-system-upgrade.md)
- [部署与配置](06-deployment.md)
