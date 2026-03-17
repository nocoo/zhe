# KV Native Expiration & Negative Cache

Worker 边缘加速层的三项优化：KV 原生过期、Worker KV miss 时轻量 lookup 替代全量回源、以及基于 lookup API 明确语义的负缓存。

> 返回 [README](../README.md)

## 背景

当前 Worker 的 KV hit 路径已经很快（边缘读 KV → 307 redirect），但三条旁路仍有优化空间：

1. **KV 中过期链接的处理**：`expiresAt` 存在 JSON value 里，Worker 每次都要解析 JSON 后手动判断过期。如果写 KV 时带上原生 `expiration` 参数，过期 key 会被 KV 自动删除，减少陈旧 key 堆积。
2. **KV miss 路径低效**：不存在的 slug、爬虫扫路径触发完整的 `forwardToOrigin()`（全量代理 → middleware → D1 查询 → 渲染 not-found 页面）。实际只需要知道"slug 存不存在"，不需要完整的 HTML 响应。
3. **KV expired hit 路径低效**：过期链接同样 `forwardToOrigin()`，触发完整回源。Worker 既然已经知道链接过期了，可以直接在边缘返回 not-found。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Worker 中手动 `expiresAt` 检查 | **保留** | KV 过期有几秒延迟窗口，保留作为安全网 |
| KV expired hit 处理 | **边缘直接返回 not-found** | Worker 已确认过期，无需回源 |
| KV miss 解析方式 | **轻量 `/api/lookup` API** | 只查 D1，返回 JSON，不渲染页面。比 `forwardToOrigin` 少了 middleware 全量处理 |
| Negative cache 存储 | **Cache API** | per-colo、自动过期、不占 KV 写入配额 |
| Negative cache TTL | **60s** | 平衡拦截效果与新建链接可用性 |
| Tombstone 触发信号 | **lookup API 的 `{ found: false }` (404)** | 明确的 slug miss 语义，不会误伤 origin 其他 404（如页面 not-found、API error） |
| 过期时间已在过去的 KV 写入 | **跳过 `expiration` 参数** | KV API 拒绝过去的 expiration 值，仍写入 value 但不设过期 |

---

## Feature 1: KV Native Expiration

### 原理

Cloudflare KV 支持 per-key 过期：
- 单 key PUT：URL query `?expiration=<unix_seconds>`
- 批量 PUT：body 中 `{ "key": "...", "value": "...", "expiration": <unix_seconds> }`

`expiresAt` 在代码中是 epoch **毫秒**，KV API 要求 epoch **秒**，需要 `Math.floor(expiresAt / 1000)` 转换。

**边界情况**：KV API 要求 `expiration` 必须大于当前时间（至少 60 秒后）。如果 `expiresAt` 已经在过去，不设 `expiration` 参数——key 仍然写入（带 `expiresAt` 在 JSON value 中），Worker 侧的手动过期检查会处理它。

### 改动

#### 1a. `lib/kv/client.ts` — `kvPutLink`

当 `data.expiresAt` 不为 null **且在未来**时，在 KV URL 后追加 `?expiration=` 参数。

```typescript
const url = kvUrl(creds, slug);
const expirationSec = data.expiresAt != null
  ? Math.floor(data.expiresAt / 1000)
  : null;
// KV requires expiration > now (at least 60s in the future)
const fetchUrl = expirationSec != null && expirationSec > Math.floor(Date.now() / 1000) + 60
  ? `${url}?expiration=${expirationSec}`
  : url;
```

- 文件：`lib/kv/client.ts`
- 函数：`kvPutLink`（约 L73）
- 影响行为：有未来 `expiresAt` 的 key 会被 KV 自动过期删除

#### 1b. `lib/kv/client.ts` — `kvBulkPutLinks`

在 payload 构造中，当 `e.data.expiresAt` 不为 null **且在未来**时追加 `expiration` 字段。

```typescript
const nowSec = Math.floor(Date.now() / 1000);
const payload = batch.map((e) => {
  const expirationSec = e.data.expiresAt != null
    ? Math.floor(e.data.expiresAt / 1000)
    : null;
  return {
    key: e.slug,
    value: JSON.stringify(e.data),
    ...(expirationSec != null && expirationSec > nowSec + 60 && {
      expiration: expirationSec,
    }),
  };
});
```

- 文件：`lib/kv/client.ts`
- 函数：`kvBulkPutLinks`（约 L137-146）
- 影响：`performKVSync()`（`lib/kv/sync.ts`）和 `scripts/sync-kv.ts` 都通过此函数写入，无需额外修改

#### 1c. `worker/src/index.ts` — 保留手动检查

**不改动** Worker 的 `expiresAt` 检查逻辑。KV 原生过期有几秒延迟，保留手动检查作为 belt-and-suspenders。

#### 1d. 测试 — `tests/unit/kv-client.test.ts`

新增测试：

1. `kvPutLink appends expiration query param when expiresAt is in the future` — 验证 URL 包含 `?expiration=`，值为秒级 epoch
2. `kvPutLink does not append expiration when expiresAt is null` — 验证 URL 不含 `?expiration=`
3. `kvPutLink does not append expiration when expiresAt is in the past` — 验证过去时间不设 expiration
4. `kvBulkPutLinks includes expiration field per entry when expiresAt is in the future` — 验证 bulk payload
5. `kvBulkPutLinks omits expiration field when expiresAt is null` — 验证 bulk payload
6. `kvBulkPutLinks omits expiration field when expiresAt is in the past` — 验证过去时间

---

## Feature 2: Worker KV Miss → Lightweight Lookup API + Negative Cache

### 问题分析

当前 KV miss 和 expired hit 路径都走 `forwardToOrigin()`，这是**全量代理**：Worker 将完整请求转发到 Railway origin → Next.js middleware 做 D1 fallback lookup → 渲染完整 HTML 页面（not-found 或 redirect）。

这里有两个浪费：
1. **KV miss**：Worker 只需要知道"slug 存不存在"，不需要完整 HTML。现有 `/api/lookup?slug=xxx` API 正好提供轻量 JSON 响应。
2. **KV expired hit**：Worker 已经从 KV JSON 里解析出 `expiresAt` 并确认过期，完全可以在边缘直接返回 not-found，不需要回源。

### 现有 Lookup API 语义

`app/api/lookup/route.ts` 已有明确语义：

```
GET /api/lookup?slug=xxx
  → 200 { found: true, id, originalUrl, slug }  — 链接存在且有效
  → 404 { found: false }                        — slug 不存在
  → 404 { found: false, expired: true }          — 链接已过期
  → 500 { error: 'Lookup failed' }               — D1 查询出错
```

### 新流程

```
请求进入 handleFetch
  │
  ├── ... 现有过滤（root/static/reserved/multi-segment）
  │
  ├── 5.5 Cache API 负缓存查询 ← 新增
  │     ├── hit → 直接返回缓存的 not-found 响应
  │     └── miss → 继续
  │
  ├── 6. KV lookup
  │     ├── hit + valid → 307 redirect + analytics
  │     ├── hit + expired → 直接返回 not-found（不再回源） ← 改动
  │     └── miss → 继续
  │
  ├── 6.5 Lookup API 查询 ← 新增（替代 forwardToOrigin）
  │     ├── { found: true } → 307 redirect + analytics + 回写 KV
  │     ├── { found: false } → not-found + 写入负缓存 tombstone
  │     └── error / non-JSON → fallback to forwardToOrigin
  │
  └── 7. Fallback → forwardToOrigin（仅 lookup API 失败时）
```

### 改动

#### 2a. `worker/src/index.ts` — KV expired hit 直接返回 not-found

当前逻辑是 `forwardToOrigin`，改为在边缘直接返回 not-found 页面响应：

```typescript
if (kvData.expiresAt && Date.now() > kvData.expiresAt) {
  // Expired — return not-found directly at the edge
  return new Response('Not Found', { status: 404 });
}
```

优点：零回源延迟，expired slug 不再消耗 origin 资源。

#### 2b. `worker/src/index.ts` — 负缓存查询（step 5.5）

在 KV lookup 之前，用 Cache API 检查是否有 tombstone：

```typescript
// 5.5 Negative cache: check if this slug was recently confirmed as non-existent
const cache = caches.default;
const negCacheKey = new Request(`https://neg-cache.internal/${slug}`);
const cached = await cache.match(negCacheKey);
if (cached) {
  return cached;
}
```

- `https://neg-cache.internal/${slug}` 是虚拟 URL，不会实际请求。Cache API 用 URL 做 key
- 返回的是之前缓存的 not-found response clone

#### 2c. `worker/src/index.ts` — Lookup API 查询（step 6.5）

KV miss 时，调用轻量 lookup API 而非 `forwardToOrigin()`：

```typescript
// 6.5 Lightweight lookup via API (instead of full forwardToOrigin)
try {
  const originBase = env.ORIGIN_URL.replace(/\/$/, '');
  const lookupRes = await fetch(
    `${originBase}/api/lookup?slug=${encodeURIComponent(slug)}`,
    { headers: { 'X-Forwarded-Host': new URL(request.url).hostname } },
  );
  const lookupData = await lookupRes.json() as {
    found: boolean;
    id?: number;
    originalUrl?: string;
    expired?: boolean;
  };

  if (lookupData.found && lookupData.originalUrl) {
    // D1 hit — redirect + analytics
    recordClickAsync(ctx, env, lookupData.id!, request);

    // Fire-and-forget: backfill KV for future edge hits
    ctx.waitUntil(
      env.LINKS_KV.put(slug, JSON.stringify({
        id: lookupData.id,
        originalUrl: lookupData.originalUrl,
        expiresAt: null, // lookup API doesn't return expiresAt
      })),
    );

    return Response.redirect(lookupData.originalUrl, 307);
  }

  // Confirmed miss or expired — write negative cache tombstone
  if (!lookupData.found) {
    const notFound = new Response('Not Found', {
      status: 404,
      headers: { 'Cache-Control': 'max-age=60' },
    });
    ctx.waitUntil(cache.put(negCacheKey, notFound.clone()));
    return notFound;
  }
} catch (err) {
  console.error(`Lookup API error for slug "${slug}":`, err);
  // Lookup API failed — fall through to forwardToOrigin as last resort
}

// 7. Fallback — full origin forward (only when lookup API itself fails)
return forwardToOrigin(request, env);
```

关键点：
- **只有 lookup API 的 `{ found: false }` 才触发 tombstone**，不会误伤 origin 其他 404
- Lookup API 失败（网络错误、500）gracefully fallback 到 `forwardToOrigin()`
- D1 hit 时 fire-and-forget 回写 KV，下次请求直接 KV hit

#### 2d. `app/api/lookup/route.ts` — 增加 `expiresAt` 字段

当前 lookup API 对 hit 情况不返回 `expiresAt`，需要补充以便 Worker 回写 KV 时保留过期信息：

```typescript
return NextResponse.json({
  found: true,
  id: link.id,
  originalUrl: link.originalUrl,
  slug: link.slug,
  expiresAt: link.expiresAt?.getTime() ?? null, // epoch ms, for KV backfill
});
```

- 文件：`app/api/lookup/route.ts`
- 改动量：1 行

#### 2e. `worker/src/index.ts` — KV 回写时使用 expiresAt

更新 2c 中 KV backfill 部分，使用 lookup 返回的 expiresAt：

```typescript
ctx.waitUntil(
  env.LINKS_KV.put(slug, JSON.stringify({
    id: lookupData.id,
    originalUrl: lookupData.originalUrl,
    expiresAt: lookupData.expiresAt ?? null,
  })),
);
```

#### 2f. 代码结构说明

改动后 `handleFetch` 中 slug 解析路径有 3 个出口：
1. **KV hit + valid** → 307 redirect（现有，不变）
2. **KV hit + expired** → 边缘直接返回 not-found（改动：不再回源）
3. **KV miss** → lookup API 查询（改动：替代 `forwardToOrigin`）
   - lookup hit → 307 redirect + KV backfill
   - lookup miss → not-found + neg cache tombstone
   - lookup error → fallback `forwardToOrigin`

`cache` 和 `negCacheKey` 在 slug 确定后、KV lookup 前声明，被 step 5.5 和 step 6.5 共用。

#### 2g. 测试 — `worker/test/index.test.ts`

Worker 测试环境没有真正的 `caches` 全局对象。需要 mock：

```typescript
const mockCache = {
  match: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
};
Object.defineProperty(globalThis, 'caches', {
  value: { default: mockCache },
  writable: true,
  configurable: true,
});
```

新增测试：

**Negative cache tests:**
1. `returns cached not-found when negative cache has tombstone for slug` — `cache.match` 返回 404 response，验证不调用 `env.LINKS_KV.get` 和 `fetch`
2. `tombstone includes Cache-Control max-age=60` — 验证 tombstone 的 headers

**KV expired hit tests:**
3. `returns 404 directly for expired KV hit without forwarding to origin` — KV 返回 expired data，验证 `fetch` 不被调用（不回源）

**Lookup API tests:**
4. `calls lookup API on KV miss and redirects on hit` — KV miss，lookup 返回 `{ found: true, ... }`，验证 307 redirect
5. `writes KV backfill on lookup API hit` — 验证 `env.LINKS_KV.put` 被调用
6. `writes tombstone on lookup API miss (found: false)` — KV miss，lookup 返回 `{ found: false }` (404)，验证 `cache.put` 被调用
7. `falls back to forwardToOrigin when lookup API fails` — lookup fetch 抛异常，验证 `forwardToOrigin` 被调用
8. `does not write tombstone on lookup API error` — lookup 返回 500，验证 `cache.put` 不被调用

**Lookup API enhancement test:**
9. `lookup API returns expiresAt for KV backfill` — 新增 `tests/unit/lookup-route.test.ts` 或在现有 API 测试中验证

---

## 原子化提交

### Commit 1: `feat: add KV native expiration on write`

独立于其他改动，低风险。

- `lib/kv/client.ts` — `kvPutLink` 追加 `?expiration=` 参数（含过去时间跳过逻辑）；`kvBulkPutLinks` 追加 `expiration` 字段
- `tests/unit/kv-client.test.ts` — 6 个新测试

### Commit 2: `feat: add expiresAt to lookup API response`

为 Worker KV backfill 做准备。

- `app/api/lookup/route.ts` — 返回 `expiresAt` 字段
- 相关测试更新

### Commit 3: `feat: Worker edge lookup + negative cache for slug miss`

核心 Worker 改动。

- `worker/src/index.ts` — 负缓存查询 + lookup API 路径 + KV expired hit 直接返回 + KV backfill
- `worker/test/index.test.ts` — mock `caches.default` + 8-9 个新测试

---

## 验证

1. `bun run test:unit` — 所有 existing + 新增测试通过
2. `bun run test:unit:coverage` — 覆盖率达标
3. `cd worker && bun run test` — Worker 测试通过
4. 每个 commit 独立可构建可测试
