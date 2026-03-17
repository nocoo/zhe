# KV Native Expiration & Negative Cache

Worker 边缘加速层的两项优化：利用 KV 原生过期替代手动检查，以及为 slug miss 路径添加短 TTL 负缓存。

> 返回 [README](../README.md)

## 背景

当前 Worker 的 KV hit 路径已经很快（边缘读 KV → 307 redirect），但两条旁路仍有优化空间：

1. **KV 中过期链接的处理**：`expiresAt` 存在 JSON value 里，Worker 每次都要解析 JSON 后手动判断过期（`worker/src/index.ts:257`）。如果写 KV 时带上原生 `expiration` 参数，过期 key 会被 KV 自动删除，减少陈旧 key 堆积。
2. **KV miss 路径**：不存在的 slug、爬虫扫路径、过期链接会反复 forward to origin（`worker/src/index.ts:273`），触发完整的 middleware → D1 查询流程。可以用 Cache API 做短 TTL 负缓存拦截重复请求。

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Worker 中手动 `expiresAt` 检查 | **保留** | KV 过期有几秒延迟窗口，保留作为安全网 |
| Negative cache 存储 | **Cache API** | per-colo、自动过期、不占 KV 写入配额 |
| Negative cache TTL | **60s** | 平衡拦截效果与新建链接可用性 |
| Slug miss 信号 | **HTTP 404 status** | Worker 在 slug lookup 上下文中已过滤 reserved/static/root/multi-segment，origin 404 = slug miss |

---

## Feature 1: KV Native Expiration

### 原理

Cloudflare KV 支持 per-key 过期：
- 单 key PUT：URL query `?expiration=<unix_seconds>`
- 批量 PUT：body 中 `{ "key": "...", "value": "...", "expiration": <unix_seconds> }`

`expiresAt` 在代码中是 epoch **毫秒**，KV API 要求 epoch **秒**，需要 `Math.floor(expiresAt / 1000)` 转换。

### 改动

#### 1a. `lib/kv/client.ts` — `kvPutLink`

当 `data.expiresAt` 不为 null 时，在 KV URL 后追加 `?expiration=` 参数。

```typescript
// 修改 kvUrl 调用或直接在 fetch URL 上追加
const url = kvUrl(creds, slug);
const fetchUrl = data.expiresAt
  ? `${url}?expiration=${Math.floor(data.expiresAt / 1000)}`
  : url;
```

- 文件：`lib/kv/client.ts`
- 函数：`kvPutLink`（约 L73）
- 影响行为：有 `expiresAt` 的 key 会被 KV 自动过期删除

#### 1b. `lib/kv/client.ts` — `kvBulkPutLinks`

在 payload 构造中，当 `e.data.expiresAt` 不为 null 时追加 `expiration` 字段。

```typescript
const payload = batch.map((e) => ({
  key: e.slug,
  value: JSON.stringify(e.data),
  ...(e.data.expiresAt != null && {
    expiration: Math.floor(e.data.expiresAt / 1000),
  }),
}));
```

- 文件：`lib/kv/client.ts`
- 函数：`kvBulkPutLinks`（约 L137-146）
- 影响：`performKVSync()`（`lib/kv/sync.ts`）和 `scripts/sync-kv.ts` 都通过此函数写入，无需额外修改

#### 1c. `worker/src/index.ts` — 保留手动检查

**不改动** Worker 的 `expiresAt` 检查逻辑。KV 原生过期有几秒延迟，保留手动检查作为 belt-and-suspenders：

```typescript
// 保留现有逻辑不变（L257-259）
if (kvData.expiresAt && Date.now() > kvData.expiresAt) {
  return forwardToOrigin(request, env);
}
```

#### 1d. 测试 — `tests/unit/kv-client.test.ts`

新增测试：

1. `kvPutLink appends expiration query param when expiresAt is set` — 验证 URL 包含 `?expiration=`，值为秒级 epoch
2. `kvPutLink does not append expiration when expiresAt is null` — 验证 URL 不含 `?expiration=`
3. `kvBulkPutLinks includes expiration field per entry when expiresAt is set` — 验证 bulk payload
4. `kvBulkPutLinks omits expiration field when expiresAt is null` — 验证 bulk payload

---

## Feature 2: Negative Cache (Cache API Tombstone)

### 原理

Cloudflare Workers Cache API（`caches.default`）是 per-PoP 缓存，适合做负缓存：
- 不需要全局一致性（per-colo 足够）
- 自动过期，无需清理
- 不占用 KV 写入配额
- 用 `Response` 对象做 tombstone，设 `Cache-Control: max-age=60`

### 流程

```
请求进入 handleFetch
  │
  ├── ... 现有过滤（root/static/reserved/multi-segment）
  │
  ├── 5.5 Cache API 负缓存查询 ← 新增
  │     ├── hit → 直接返回缓存的 404 响应
  │     └── miss → 继续
  │
  ├── 6. KV lookup
  │     ├── hit + valid → 307 redirect
  │     ├── hit + expired → forward to origin
  │     └── miss → forward to origin
  │
  └── 7. Forward to origin
        └── 检查 origin 响应 ← 新增
              ├── status 404 → ctx.waitUntil(cache.put(tombstone))
              └── 其他 → 原样返回
```

### 改动

#### 2a. `worker/src/index.ts` — 负缓存查询（step 5.5）

在 KV lookup 之前，用 Cache API 检查是否有 tombstone：

```typescript
// 5.5 Negative cache: check if this slug was recently confirmed as non-existent
const cacheKey = new Request(`https://neg-cache.internal/${slug}`);
const cache = caches.default;
const cached = await cache.match(cacheKey);
if (cached) {
  return cached;
}
```

- `https://neg-cache.internal/${slug}` 是虚拟 URL，不会实际请求。Cache API 用 URL 做 key
- 返回的是之前缓存的 404 response clone

#### 2b. `worker/src/index.ts` — 写入负缓存（step 7 后）

当 forward to origin 收到 404 时，写入 tombstone：

```typescript
const originResponse = await forwardToOrigin(request, env);

// Write negative cache tombstone for confirmed slug misses
if (originResponse.status === 404) {
  const tombstone = new Response(originResponse.body, {
    status: 404,
    headers: {
      ...Object.fromEntries(originResponse.headers.entries()),
      'Cache-Control': 'max-age=60',
    },
  });
  ctx.waitUntil(cache.put(cacheKey, tombstone.clone()));
  return tombstone;
}

return originResponse;
```

注意事项：
- `cache.put()` 会消费 body，必须 `.clone()` 后放入 cache
- `Cache-Control: max-age=60` 控制 tombstone 60s 后过期
- 需要把 `cacheKey` 和 `cache` 的声明提到函数顶部（或在 slug 确定后声明）

#### 2c. `worker/src/index.ts` — 代码结构调整

需要重构 handleFetch 的 KV miss 路径，把 `forwardToOrigin` 调用和 tombstone 逻辑合并。目前有 3 处 `forwardToOrigin` 在 slug 上下文：
- KV hit + expired（L258）
- KV error（L268-270 catch block, falls through to L273）
- KV miss（L273）

这 3 处都需要走 negative cache 写入逻辑。可以提取为 `forwardSlugToOrigin` 辅助函数：

```typescript
async function forwardSlugToOrigin(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  slug: string,
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(`https://neg-cache.internal/${slug}`);
  const originResponse = await forwardToOrigin(request, env);

  if (originResponse.status === 404) {
    const tombstone = new Response(originResponse.body, {
      status: 404,
      headers: {
        ...Object.fromEntries(originResponse.headers.entries()),
        'Cache-Control': 'max-age=60',
      },
    });
    ctx.waitUntil(cache.put(cacheKey, tombstone.clone()));
    return tombstone;
  }

  return originResponse;
}
```

然后 KV miss/expired/error 路径都调用 `forwardSlugToOrigin`。

#### 2d. 测试 — `worker/test/index.test.ts`

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

1. `returns cached 404 when negative cache has tombstone for slug` — `cache.match` 返回 404 response，验证不调用 `env.LINKS_KV.get` 和 `fetch`
2. `writes tombstone when origin returns 404 for slug miss` — `cache.match` 返回 undefined，KV miss，origin 返回 404，验证 `cache.put` 被调用且 key 正确
3. `does not write tombstone when origin returns non-404` — origin 返回 200（redirect from middleware），验证 `cache.put` 不被调用
4. `tombstone includes Cache-Control max-age=60` — 验证 put 的 response headers

---

## 原子化提交

### Commit 1: `feat: add KV native expiration on write`

- `lib/kv/client.ts` — `kvPutLink` 追加 `?expiration=` 参数；`kvBulkPutLinks` 追加 `expiration` 字段
- `tests/unit/kv-client.test.ts` — 4 个新测试

### Commit 2: `feat: add negative cache for slug miss in Worker`

- `worker/src/index.ts` — 负缓存查询 + tombstone 写入 + `forwardSlugToOrigin` 辅助函数
- `worker/test/index.test.ts` — mock `caches.default` + 4 个新测试

---

## 验证

1. `bun run test:unit` — 所有 existing + 新增测试通过
2. `bun run test:unit:coverage` — 覆盖率达标
3. `cd worker && bun run test` — Worker 测试通过
4. 每个 commit 独立可构建可测试
