# 16. Worker D1 Proxy — Edge Database Access

## Problem Statement

Dashboard CRUD operations currently flow through a high-latency path:

```
Browser → Railway (Tokyo) → Cloudflare D1 HTTP API (US) → D1
                          ↑
                    5s timeout, cross-region latency
```

This causes `TimeoutError` (code 23) when D1 API is slow or cold-starting. The 5-second timeout in `d1-client.ts` is often insufficient for cross-Pacific requests.

## Solution: Worker D1 Proxy

Route D1 queries through the existing Worker, which has native D1 binding (no HTTP overhead):

```
Browser → Worker (edge, global) → D1 binding → D1
              │
              └─ Non-D1 requests → Railway (origin)
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
Authorization: Bearer {WORKER_SECRET}
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

1. **Bearer token auth** — Reuse existing `WORKER_SECRET` (already used for `/api/record-click`, `/api/cron/*`)
2. **No user context** — Worker is a dumb proxy; Railway handles auth and builds scoped queries
3. **SQL injection safe** — Parameterized queries only; Worker passes params verbatim to D1

### Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dashboard Request                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Railway: Server Action / API Route                              │
│  ├─ auth() → get userId                                          │
│  ├─ ScopedDB(userId) → build SQL with userId in WHERE            │
│  └─ executeD1Query(sql, params)                                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  d1-client.ts                                                    │
│  ├─ if (USE_WORKER_D1_PROXY)                                     │
│  │     POST {WORKER_URL}/api/d1-query                            │
│  │     Authorization: Bearer {WORKER_SECRET}                     │
│  └─ else (fallback)                                              │
│        POST api.cloudflare.com/... (existing HTTP API)           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Worker: /api/d1-query handler                                   │
│  ├─ Verify Authorization header                                  │
│  ├─ env.DB.prepare(sql).bind(...params).all()                    │
│  └─ Return { success, results, meta }                            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare D1 (native binding, no HTTP)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Worker D1 Binding + Proxy Endpoint

**Commit 1: Add D1 binding to Worker wrangler.toml**
```toml
[[d1_databases]]
binding = "DB"
database_name = "zhe"
database_id = "xxx"
```

**Commit 2: Add /api/d1-query handler in Worker**
- Parse JSON body `{ sql, params }`
- Verify `Authorization: Bearer {WORKER_SECRET}`
- Execute via `env.DB.prepare(sql).bind(...params).all()`
- Return standardized response format

**Commit 3: Add Worker D1 proxy tests**
- Auth validation (missing/invalid token → 401)
- SQL execution (SELECT, INSERT, UPDATE, DELETE)
- Error handling (syntax error, constraint violation)

### Phase 2: Client Integration

**Commit 4: Add feature flag and proxy client in d1-client.ts**
```typescript
const USE_WORKER_D1_PROXY = process.env.WORKER_D1_PROXY_URL;

export async function executeD1Query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (USE_WORKER_D1_PROXY) {
    return executeViaWorkerProxy(sql, params);
  }
  return executeViaHttpApi(sql, params); // existing code
}
```

**Commit 5: Add integration tests for proxy path**
- Mock Worker endpoint
- Verify request format
- Verify response parsing

### Phase 3: Deployment + Rollout

**Commit 6: Deploy Worker with D1 binding**
- `cd worker && bun run deploy`
- Verify `/api/d1-query` responds

**Commit 7: Enable proxy in Railway**
- Set `WORKER_D1_PROXY_URL=https://zhe-edge.xxx.workers.dev`
- Set `WORKER_SECRET` (already exists)

## Environment Variables

### Worker (wrangler.toml secrets)

| Variable | Value | Notes |
|----------|-------|-------|
| `WORKER_SECRET` | (existing) | Shared secret for auth |

### Worker (wrangler.toml bindings)

| Binding | Type | Notes |
|---------|------|-------|
| `DB` | D1 | Native D1 binding |
| `LINKS_KV` | KV | (existing) |

### Railway

| Variable | Value | Notes |
|----------|-------|-------|
| `WORKER_D1_PROXY_URL` | `https://zhe-edge.xxx.workers.dev` | New |
| `WORKER_SECRET` | (existing) | Reused for auth |

## 6DQ Coverage

### L1: Unit Tests

| Test | Location | Coverage |
|------|----------|----------|
| D1 proxy handler auth | `worker/test/d1-proxy.test.ts` | 401 on missing/invalid token |
| D1 proxy handler execution | `worker/test/d1-proxy.test.ts` | SELECT/INSERT/UPDATE/DELETE |
| D1 proxy client | `tests/unit/d1-client.test.ts` | Proxy path with mock fetch |

### L2: API E2E

| Test | Location | Coverage |
|------|----------|----------|
| Proxy endpoint real HTTP | `tests/api/d1-proxy.test.ts` | Real Worker + test D1 |

### L3: System E2E

Existing Playwright tests exercise full CRUD paths — no new tests needed, but verify they pass after rollout.

### G1: Static Analysis

- TypeScript strict mode (existing)
- ESLint (existing)
- Worker code follows same lint rules

### G2: Security

- `WORKER_SECRET` validation (401 on failure)
- No SQL string concatenation (parameterized only)
- gitleaks scan (existing)

### D1: Data Isolation

- Worker connects to same D1 database (production or test based on binding)
- Test environment uses `zhe-db-test` binding
- No cross-environment access possible (bindings are deployment-specific)

## Rollback Plan

1. Unset `WORKER_D1_PROXY_URL` in Railway
2. `d1-client.ts` falls back to HTTP API automatically
3. No Worker changes needed (endpoint remains available)

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| D1 query p50 latency | ~300ms | <50ms |
| D1 query p99 latency | ~2000ms | <200ms |
| Timeout errors/day | 5-10 | 0 |

## Future Considerations

1. **Batch queries** — Worker could accept `{ queries: [{sql, params}, ...] }` for atomic multi-statement transactions
2. **Read replicas** — D1 supports read replicas; Worker binding can route reads to nearest replica
3. **Caching** — Worker could cache hot queries in KV (e.g., user settings)
