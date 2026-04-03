# 16. Worker D1 Proxy — Edge Database Access

## Problem Statement

All D1 database operations currently flow through a high-latency path:

```
Railway (Tokyo) → Cloudflare D1 HTTP API (US) → D1
                ↑
          5s timeout, cross-region latency
```

This causes `TimeoutError` (code 23) when D1 API is slow or cold-starting. The 5-second timeout in `d1-client.ts` is often insufficient for cross-Pacific requests.

**Affected code paths** (all callers of `executeD1Query`):
- `ScopedDB` — Dashboard CRUD (links, folders, tags, uploads, webhooks, settings)
- `lib/db/index.ts` — Public queries (slug lookup, tweet cache, KV sync)
- `lib/auth-adapter.ts` — NextAuth session/user operations

## Solution: Worker D1 Proxy

Route D1 queries through the existing Worker, which has native D1 binding (no HTTP overhead):

```
Railway → Worker (edge) → D1 binding → D1
              │
              └─ 5-20ms vs 200-500ms+
```

### Why This Works

| Path | Latency | Notes |
|------|---------|-------|
| Railway → D1 HTTP API | 200-500ms+ | Cross-region, HTTP overhead, cold starts |
| Worker → D1 binding | 5-20ms | Same Cloudflare network, native binding |

Workers are deployed globally and use D1's native binding (`env.DB`), not the HTTP API.

## Architecture

### New Worker Endpoint

```
POST /api/d1-query
Authorization: Bearer {D1_PROXY_SECRET}
Content-Type: application/json

{
  "sql": "SELECT * FROM links WHERE user_id = ?",
  "params": ["user_123"]
}
```

Response:
```json
{
  "success": true,
  "results": [...],
  "meta": { "changes": 0, "last_row_id": 0 }
}
```

### Security Model

#### 1. Dedicated Secret (CRITICAL)

**`D1_PROXY_SECRET` MUST be separate from `WORKER_SECRET`.**

| Secret | Current Scope | Compromise Impact |
|--------|---------------|-------------------|
| `WORKER_SECRET` | `/api/record-click`, `/api/cron/*` | Limited: click recording, cleanup triggers |
| `D1_PROXY_SECRET` | `/api/d1-query` | **Full database read/write** |

Reusing `WORKER_SECRET` would expand its blast radius from "trigger limited internal actions" to "execute arbitrary SQL". If `WORKER_SECRET` leaks (e.g., via log exposure), the attacker gains full database access instead of just being able to record fake clicks.

**Requirement**: Generate and deploy `D1_PROXY_SECRET` as an independent high-entropy secret.

#### 2. No User Context

Worker is a dumb SQL proxy. Railway handles authentication and constructs scoped queries (e.g., `WHERE user_id = ?`). Worker never interprets user identity.

#### 3. SQL Injection Prevention

Worker uses parameterized queries only:
```typescript
env.DB.prepare(sql).bind(...params).all()
```

Worker MUST NOT concatenate SQL strings. The `sql` field is passed directly to `prepare()`, and `params` to `bind()`.

### Worker Routing Fix (CRITICAL)

Current Worker treats `api` as a reserved path and forwards all `/api/*` to origin:

```typescript
// worker/src/index.ts:63
const RESERVED_PATHS = new Set(['api', ...]);

// worker/src/index.ts:248
if (isReservedPath(slug)) {
  return forwardToOrigin(request, env);
}
```

**The `/api/d1-query` handler MUST be checked BEFORE the reserved path logic**, otherwise requests will be forwarded to Railway instead of handled by Worker.

Fix in `handleFetch()`:
```typescript
// 0. D1 proxy endpoint — handle before reserved path check
if (pathname === '/api/d1-query' && request.method === 'POST') {
  return handleD1Query(request, env);
}

// 1. Reserved paths → forward to origin (existing)
if (isReservedPath(slug)) {
  return forwardToOrigin(request, env);
}
```

### Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Railway: Server Action / API Route / Auth Adapter               │
│  ├─ auth() → get userId (if applicable)                          │
│  ├─ Build SQL with appropriate scope                             │
│  └─ executeD1Query(sql, params)                                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  d1-client.ts                                                    │
│  ├─ if (D1_PROXY_URL && D1_PROXY_SECRET)                         │
│  │     POST {D1_PROXY_URL}/api/d1-query                          │
│  │     Authorization: Bearer {D1_PROXY_SECRET}                   │
│  └─ else (fallback)                                              │
│        POST api.cloudflare.com/... (existing HTTP API)           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Worker: /api/d1-query handler                                   │
│  ├─ Verify Authorization: Bearer {D1_PROXY_SECRET}               │
│  ├─ env.DB.prepare(sql).bind(...params).all()                    │
│  └─ Return { success, results, meta }                            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare D1 (native binding, no HTTP)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Test Environment Isolation (CRITICAL)

### Problem

Current L2/L3 test isolation relies on overwriting `CLOUDFLARE_D1_DATABASE_ID` in the Next.js process:

```typescript
// scripts/run-api-e2e.ts:98
process.env.CLOUDFLARE_D1_DATABASE_ID = process.env.D1_TEST_DATABASE_ID;
```

Once queries route through Worker, this protection is **bypassed** — the Worker's D1 binding is determined by its deployment configuration (`wrangler.toml`), not by Railway's environment variables.

### Solution: Dual Worker Deployments

| Environment | Worker URL | D1 Binding | KV Binding |
|-------------|------------|------------|------------|
| Production | `https://zhe-edge.xxx.workers.dev` | `zhe` (prod) | `zhe` (prod) |
| Test | `https://zhe-edge-test.xxx.workers.dev` | `zhe-db-test` | `zhe-test` |

**Implementation:**

1. **New `worker/wrangler.test.toml`** — Test environment config with test D1/KV bindings
2. **Deploy test Worker** — `wrangler deploy -c wrangler.test.toml` → `zhe-edge-test`
3. **L2/L3 harness update** — Set `D1_PROXY_URL=https://zhe-edge-test.xxx.workers.dev`
4. **CI/local parity** — Both use the same test Worker URL

**Verification in test harness:**
```typescript
// scripts/run-api-e2e.ts — add after existing D1 isolation check
if (process.env.D1_PROXY_URL && !process.env.D1_PROXY_URL.includes('-test')) {
  throw new Error('D1_PROXY_URL must point to test Worker in test environment');
}
```

## Implementation Plan

### Phase 1: Worker Infrastructure

**Commit 1: Add test Worker config (wrangler.test.toml)**
- D1 binding → `zhe-db-test`
- KV binding → `zhe-test`
- Worker name → `zhe-edge-test`

**Commit 2: Add D1 binding to production Worker (wrangler.toml)**
```toml
[[d1_databases]]
binding = "DB"
database_name = "zhe"
database_id = "xxx-prod-id"
```

**Commit 3: Add /api/d1-query handler with routing fix**
- Insert handler BEFORE reserved path check
- Verify `Authorization: Bearer {D1_PROXY_SECRET}`
- Execute via `env.DB.prepare(sql).bind(...params).all()`
- Return standardized response format

**Commit 4: Add Worker D1 proxy tests**
- Auth validation (missing/invalid token → 401)
- Wrong secret (WORKER_SECRET instead of D1_PROXY_SECRET) → 401
- SQL execution (SELECT, INSERT, UPDATE, DELETE)
- Error handling (syntax error, constraint violation)
- Routing: verify `/api/d1-query` is handled, not forwarded

### Phase 2: Client Integration

**Commit 5: Add D1_PROXY_SECRET and proxy client in d1-client.ts**
```typescript
function getProxyCredentials(): { url: string; secret: string } | null {
  const url = process.env.D1_PROXY_URL;
  const secret = process.env.D1_PROXY_SECRET;
  if (!url || !secret) return null;
  return { url, secret };
}

export async function executeD1Query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const proxy = getProxyCredentials();
  if (proxy) {
    return executeViaWorkerProxy(proxy, sql, params);
  }
  return executeViaHttpApi(sql, params); // existing fallback
}
```

**Commit 6: Add d1-client proxy path unit tests**
- Mock fetch for proxy endpoint
- Verify Authorization header uses D1_PROXY_SECRET (not WORKER_SECRET)
- Verify request/response format
- Verify fallback when proxy not configured

### Phase 3: Test Harness Update

**Commit 7: Update L2/L3 harness for test Worker**
- `scripts/run-api-e2e.ts`: Set `D1_PROXY_URL` to test Worker
- `playwright.config.ts` / `tests/e2e/global-setup.ts`: Same
- Add safety check: reject if `D1_PROXY_URL` doesn't contain `-test`

**Commit 8: Add L2 test for proxy endpoint**
- Real HTTP call to test Worker
- Verify roundtrip through test D1

### Phase 4: Deployment + Rollout

**Commit 9: Deploy Workers**
- `wrangler deploy` (prod Worker with D1 binding)
- `wrangler deploy -c wrangler.test.toml` (test Worker)
- `wrangler secret put D1_PROXY_SECRET` (both environments)

**Commit 10: Enable proxy in Railway**
- Set `D1_PROXY_URL=https://zhe-edge.xxx.workers.dev`
- Set `D1_PROXY_SECRET=<new-high-entropy-secret>`

## Environment Variables

### Worker Secrets (via `wrangler secret put`)

| Secret | Environment | Notes |
|--------|-------------|-------|
| `WORKER_SECRET` | prod + test | Existing, for record-click/cron |
| `D1_PROXY_SECRET` | prod + test | **New**, for D1 proxy only |

### Worker Bindings (wrangler.toml)

**Production (`wrangler.toml`):**
| Binding | Type | Value |
|---------|------|-------|
| `DB` | D1 | `zhe` (prod database) |
| `LINKS_KV` | KV | `zhe` (prod namespace) |

**Test (`wrangler.test.toml`):**
| Binding | Type | Value |
|---------|------|-------|
| `DB` | D1 | `zhe-db-test` |
| `LINKS_KV` | KV | `zhe-test` |

### Railway

| Variable | Value | Notes |
|----------|-------|-------|
| `D1_PROXY_URL` | `https://zhe-edge.xxx.workers.dev` | New |
| `D1_PROXY_SECRET` | `<high-entropy>` | New, separate from WORKER_SECRET |

### Local Development / CI

| Variable | Value | Notes |
|----------|-------|-------|
| `D1_PROXY_URL` | `https://zhe-edge-test.xxx.workers.dev` | Test Worker |
| `D1_PROXY_SECRET` | `<test-secret>` | Can be same across dev/CI |

## 6DQ Coverage

### L1: Unit Tests

| Test | Location | Coverage |
|------|----------|----------|
| D1 proxy handler auth | `worker/test/d1-proxy.test.ts` | 401 on missing/invalid/wrong token |
| D1 proxy handler routing | `worker/test/d1-proxy.test.ts` | Handler runs before reserved path forward |
| D1 proxy handler execution | `worker/test/d1-proxy.test.ts` | SELECT/INSERT/UPDATE/DELETE |
| D1 proxy client | `tests/unit/d1-client.test.ts` | Proxy path, fallback, credential handling |

### L2: API E2E

| Test | Location | Coverage |
|------|----------|----------|
| Proxy endpoint real HTTP | `tests/api/d1-proxy.test.ts` | Real test Worker + test D1 |
| Existing API tests | `tests/api/*.test.ts` | All existing tests run through proxy |

**Regression scope**: L2 tests cover all `executeD1Query` callers:
- Links CRUD
- Folders CRUD
- Tags CRUD
- Uploads CRUD
- Webhooks CRUD
- Settings
- Auth adapter (session/user)
- Public slug lookup
- KV sync

### L3: System E2E

Existing Playwright tests exercise full user flows. **All tests MUST pass** after rollout — not just CRUD, but also:
- Login/logout (auth adapter)
- Link creation and redirect (public lookup)
- Analytics recording

### G1: Static Analysis

- TypeScript strict mode (existing)
- ESLint (existing)
- Worker code follows same lint rules

### G2: Security

| Check | Implementation |
|-------|----------------|
| Dedicated D1_PROXY_SECRET | Separate from WORKER_SECRET |
| Auth validation | 401 on missing/invalid token |
| Parameterized queries | No SQL concatenation |
| gitleaks scan | Existing, covers new secret |
| Secret rotation | Document rotation procedure |

### D1: Data Isolation

| Environment | D1 Binding | Verification |
|-------------|------------|--------------|
| Production | `zhe` | Railway `D1_PROXY_URL` → prod Worker |
| Test (L2/L3) | `zhe-db-test` | Harness sets → test Worker |
| Local dev | `zhe-db-test` | `.env.local` → test Worker |

**Safety checks:**
1. Test harness rejects `D1_PROXY_URL` without `-test` suffix
2. Test Worker wrangler.test.toml only binds test resources
3. `_test_marker` table check remains in test setup (D1 level)

## Rollback Plan

1. Unset `D1_PROXY_URL` and `D1_PROXY_SECRET` in Railway
2. `d1-client.ts` falls back to HTTP API automatically (feature flag check)
3. No Worker changes needed (endpoint remains available but unused)
4. Verify L2/L3 tests pass with fallback path

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| D1 query p50 latency | ~300ms | <50ms |
| D1 query p99 latency | ~2000ms | <200ms |
| Timeout errors/day | 5-10 | 0 |

## Future Considerations

1. **Batch queries** — Worker could accept `{ queries: [{sql, params}, ...] }` for atomic multi-statement transactions
2. **Read replicas** — D1 supports read replicas; Worker binding can route reads to nearest replica
3. **Query allowlist** — For defense-in-depth, Worker could validate SQL against known query patterns
