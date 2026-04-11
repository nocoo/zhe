# D1 Worker Proxy Migration

> **Status**: Migration completed. Production runtime D1 access now routes through `zhe-edge` Worker's `/api/d1-query` endpoint. Dev/CI tooling (drizzle-kit, E2E seed) still uses direct D1 REST API.

---

## Architecture States

### Current State (Implemented)

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRODUCTION                               │
│                                                                 │
│   Railway Server                                                │
│        │                                                        │
│        ├──► zhe-edge Worker /api/d1-query ──► D1 (binding)     │
│        │    Authorization: Bearer <D1_PROXY_SECRET>            │
│        │                                                        │
│        └──► Cloudflare KV HTTP API (direct)                    │
│             Authorization: Bearer <CLOUDFLARE_API_TOKEN>        │
│                                                                 │
│   Existing API routes (webhook-style auth):                    │
│        /api/link/create/[token]  ──► Create link               │
│        /api/tmp/upload/[token]   ──► Temp file upload          │
│        /api/lookup               ──► Slug lookup (no auth)     │
│                                                                 │
│   CLI: Not yet implemented. See Future Work for design.        │
└─────────────────────────────────────────────────────────────────┘
```

**Key implementation details**:
- D1 Proxy: `POST /api/d1-query` on `zhe-edge` Worker (in `worker/src/index.ts`)
- Auth: `Authorization: Bearer ${D1_PROXY_SECRET}`
- Client: `lib/db/d1-client.ts` uses `D1_PROXY_URL` + `D1_PROXY_SECRET`
- **No fallback**: Proxy is mandatory; missing credentials = hard error

### Transition State (Retained Direct Access)

```
┌─────────────────────────────────────────────────────────────────┐
│              STILL USING CLOUDFLARE REST API                    │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  KV RUNTIME (requires credentials in Railway prod)     │  │
│   │                                                         │  │
│   │  lib/kv/client.ts ──► Cloudflare KV HTTP API           │  │
│   │       CLOUDFLARE_ACCOUNT_ID                             │  │
│   │       CLOUDFLARE_KV_NAMESPACE_ID                        │  │
│   │       CLOUDFLARE_API_TOKEN                              │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  DEV/CI TOOLING (NOT needed in Railway prod)            │  │
│   │                                                         │  │
│   │  drizzle-kit ──► D1 REST API (local dev only)          │  │
│   │  E2E test seed ──► D1 REST API (CI only)               │  │
│   │  Manual scripts ──► D1 REST API (local dev only)       │  │
│   │       CLOUDFLARE_D1_DATABASE_ID                         │  │
│   └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Security Boundary

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY MODEL                               │
│                                                                 │
│   ┌─────────────────┐     ┌─────────────────────────────────┐  │
│   │  TRUSTED ZONE   │     │  UNTRUSTED ZONE                 │  │
│   │  (server-side)  │     │  (distributed clients)          │  │
│   │                 │     │                                 │  │
│   │  Railway Server │     │  Browser (user machines)        │  │
│   │  CI/CD Pipeline │     │  CLI (future, see below)        │  │
│   │                 │     │  Mobile apps (future)           │  │
│   └────────┬────────┘     └────────┬────────────────────────┘  │
│            │                       │                            │
│            ▼                       ▼                            │
│   ┌─────────────────┐     ┌─────────────────────────────────┐  │
│   │ SQL Proxy       │     │ Business API (future for CLI)  │  │
│   │ /api/d1-query   │     │ /api/links                      │  │
│   │                 │     │ /api/folders                    │  │
│   │ D1_PROXY_SECRET │     │ /api/uploads                    │  │
│   │ (server only)   │     │                                 │  │
│   │                 │     │ api_key (per-user, hashed)      │  │
│   │ ⚠️  INTERNAL    │     │ ✅ Scoped, rate-limited         │  │
│   │    ONLY         │     │                                 │  │
│   └─────────────────┘     └─────────────────────────────────┘  │
│                                                                 │
│   Security boundary is at Next.js API, NOT at Worker.          │
│   API must enforce business rules, not be a DB passthrough.    │
│   D1_PROXY_SECRET ≈ CLOUDFLARE_API_TOKEN in risk.              │
└─────────────────────────────────────────────────────────────────┘
```

**Key Security Rules**:

1. **SQL Proxy is internal-only**: `/api/d1-query` is never exposed to CLI or browser clients
2. **Secret equivalence**: `D1_PROXY_SECRET` ≈ `CLOUDFLARE_API_TOKEN` — both allow arbitrary SQL
3. **CLI design (future)**: Per-user api_key to business API endpoints, not raw SQL
4. **Defense in depth**: api_key leak = one user's scoped data; D1_PROXY_SECRET leak = full DB
5. **Real auth boundary**: Next.js API layer, not Worker — API must not be a "remote DB facade"

---

## Implementation Details

### Worker Endpoint

**Location**: `worker/src/index.ts` (in existing `zhe-edge` Worker)

**Endpoint**: `POST /api/d1-query`

**Request**:
```json
{
  "sql": "SELECT * FROM links WHERE slug = ?",
  "params": ["abc"]
}
```

**Headers**:
```
Authorization: Bearer <D1_PROXY_SECRET>
Content-Type: application/json
```

**Response** (success):
```json
{
  "success": true,
  "results": [{ "id": 1, "slug": "abc", ... }],
  "meta": { "changes": 0, "last_row_id": 0 }
}
```

**Response** (error):
```json
{
  "success": false,
  "error": "UNIQUE constraint failed"
}
```

### Client Implementation

**Location**: `lib/db/d1-client.ts`

```typescript
function getProxyCredentials(): { url: string; secret: string } {
  const url = process.env.D1_PROXY_URL;
  const secret = process.env.D1_PROXY_SECRET;

  if (!url || !secret) {
    throw new Error('D1 proxy not configured. Set D1_PROXY_URL and D1_PROXY_SECRET.');
  }

  return { url, secret };
}
```

**Note**: No fallback to direct D1 REST API. Missing credentials = hard error.

### Environment Variables

| Variable | Required In | Purpose |
|----------|-------------|---------|
| `D1_PROXY_URL` | Railway, Local, CI | Worker URL (e.g., `https://zhe-edge.xxx.workers.dev`) |
| `D1_PROXY_SECRET` | Railway, Local, CI | Auth secret for `/api/d1-query` |
| `CLOUDFLARE_ACCOUNT_ID` | Railway, Local, CI | **KV + Drizzle** (NOT removed!) |
| `CLOUDFLARE_API_TOKEN` | Railway, Local, CI | **KV + Drizzle** (NOT removed!) |
| `CLOUDFLARE_KV_NAMESPACE_ID` | Railway, Local | KV cache operations |
| `CLOUDFLARE_D1_DATABASE_ID` | Local, CI | Drizzle migrations, E2E seed |

---

## D1 Access Points Inventory

### Entry Point

| File | Function | Description |
|------|----------|-------------|
| `lib/db/d1-client.ts` | `executeD1Query<T>()` | **Single entry point** for all D1 calls via Worker proxy |

### All Callers of `executeD1Query()`

| File | Purpose | Auth Required |
|------|---------|---------------|
| `lib/db/scoped.ts` | User-scoped CRUD (ScopedDB class) | Yes (user session) |
| `lib/db/index.ts` | Public queries (slug lookup, click recording) | No |
| `lib/auth-adapter.ts` | Auth.js adapter (user/session/account CRUD) | No (internal) |
| `actions/storage.ts` | Storage audit (D1 row counts) | Yes (user session) |

### ScopedDB Methods (`lib/db/scoped.ts`)

| Method | SQL Type | Frequency |
|--------|----------|-----------|
| `getLinks()` | SELECT | High |
| `getLinkById()` | SELECT | High |
| `getLinksByIds()` | SELECT (chunked) | Medium |
| `createLink()` | INSERT | High |
| `deleteLink()` | DELETE | Low |
| `updateLink()` | UPDATE | Medium |
| `updateLinkMetadata()` | UPDATE | Low |
| `updateLinkScreenshot()` | UPDATE | Low |
| `updateLinkNote()` | UPDATE | Low |
| `getAnalyticsByLinkId()` | SELECT (JOIN) | Medium |
| `getAnalyticsStats()` | SELECT (5 aggregates) | Medium |
| `getFolders()` | SELECT | Medium |
| `getFolderById()` | SELECT | Low |
| `createFolder()` | INSERT | Low |
| `updateFolder()` | UPDATE | Low |
| `deleteFolder()` | DELETE | Low |
| `getUploads()` | SELECT | Medium |
| `createUpload()` | INSERT | Medium |
| `deleteUpload()` | DELETE | Low |
| `getUploadKey()` | SELECT | Low |
| `getOverviewStats()` | SELECT (9 aggregates) | Medium |
| `getWebhook()` | SELECT | Low |
| `upsertWebhook()` | UPSERT | Low |
| `updateWebhookRateLimit()` | UPDATE | Low |
| `deleteWebhook()` | DELETE | Low |
| `getTags()` | SELECT | Medium |
| `createTag()` | INSERT | Low |
| `updateTag()` | UPDATE | Low |
| `deleteTag()` | DELETE | Low |
| `getLinkTags()` | SELECT (JOIN) | Medium |
| `addTagToLink()` | SELECT + INSERT | Low |
| `removeTagFromLink()` | DELETE | Low |
| `getUserSettings()` | SELECT | Medium |
| `upsertPreviewStyle()` | UPSERT | Low |
| `getBackySettings()` | SELECT | Low |
| `upsertBackySettings()` | UPSERT | Low |
| `getXraySettings()` | SELECT | Low |
| `upsertXraySettings()` | UPSERT | Low |
| `getBackyPullWebhook()` | SELECT | Low |
| `upsertBackyPullWebhook()` | UPSERT | Low |
| `deleteBackyPullWebhook()` | UPDATE | Low |

### Public Queries (`lib/db/index.ts`)

| Function | SQL Type | Frequency | Purpose |
|----------|----------|-----------|---------|
| `getLinkBySlug()` | SELECT | **Very High** | Redirect lookup |
| `slugExists()` | SELECT COUNT | High | Unique slug generation |
| `createLink()` | INSERT | Medium | Webhook creation |
| `getLinkByUserAndUrl()` | SELECT | Medium | Webhook idempotency |
| `getAllLinksForKV()` | SELECT (full table) | Low | KV sync |
| `recordClick()` | INSERT + UPDATE | **Very High** | Click analytics |
| `getFolderByUserAndName()` | SELECT | Low | Webhook folder resolution |
| `getWebhookByToken()` | SELECT | Medium | API auth |
| `getWebhookStats()` | SELECT (2 queries) | Low | API GET |
| `getTweetCacheById()` | SELECT | Medium | Tweet cache |
| `upsertTweetCache()` | UPSERT | Medium | Tweet cache |
| `verifyBackyPullWebhook()` | SELECT | Low | Backy auth |

### Auth Adapter (`lib/auth-adapter.ts`)

| Method | SQL Type | Purpose |
|--------|----------|---------|
| `createUser()` | INSERT | OAuth user creation |
| `getUser()` | SELECT | User lookup by ID |
| `getUserByEmail()` | SELECT | User lookup by email |
| `getUserByAccount()` | SELECT (JOIN) | OAuth account lookup |
| `updateUser()` | UPDATE | User profile update |
| `deleteUser()` | DELETE | User deletion |
| `linkAccount()` | INSERT | OAuth account linking |
| `unlinkAccount()` | DELETE | OAuth account unlinking |
| `createSession()` | INSERT | Session creation |
| `getSessionAndUser()` | SELECT (JOIN) | Session validation |
| `updateSession()` | UPDATE | Session refresh |
| `deleteSession()` | DELETE | Logout |
| `createVerificationToken()` | INSERT | Email verification token |
| `useVerificationToken()` | DELETE + RETURNING | Consume verification token |

### Storage Actions (`actions/storage.ts`)

| Function | SQL Type | Purpose |
|----------|----------|---------|
| `getD1Stats()` | SELECT COUNT (6 tables) | Storage audit dashboard |

### Middleware (`middleware.ts`)

| Call | SQL Type | Frequency |
|------|----------|-----------|
| `getLinkBySlug()` | SELECT | **Very High** |
| `recordClick()` | INSERT + UPDATE | **Very High** |

### API Routes

| Route | Auth | SQL Type | Frequency |
|-------|------|----------|-----------|
| `/api/record-click` | WORKER_SECRET | INSERT + UPDATE | High |
| `/api/lookup` | None | SELECT | High |
| `/api/link/create/[token]` | Webhook token | SELECT + INSERT | Medium |
| `/api/tmp/upload/[token]` | Webhook token | SELECT | Low |
| `/api/backy/pull` | Backy key | SELECT | Low |

---

## KV Operations (Not Part of D1 Migration)

**⚠️ IMPORTANT**: KV operations still use Cloudflare REST API directly. These credentials MUST remain in production:

| Operation | File | Credentials Used |
|-----------|------|------------------|
| `kvPutLink()` | `lib/kv/client.ts` | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_KV_NAMESPACE_ID` |
| `kvDeleteLink()` | `lib/kv/client.ts` | Same |
| `kvBulkPutLinks()` | `lib/kv/client.ts` | Same |
| KV sync (calls `kvBulkPutLinks`) | `lib/kv/sync.ts`, `/api/cron/sync-kv` | Same |

KV migration to Worker binding is a **separate future project**.

---

## Future Work

### CLI Access Architecture

CLI and other distributed clients must access data through business API endpoints, not SQL proxy.

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLI ACCESS PATH                            │
│                                                                 │
│   CLI (user machine)                                            │
│        │                                                        │
│        │ api_key (per-user, hashed in DB)                      │
│        ▼                                                        │
│   Next.js API (/api/links, /api/folders, ...)                  │
│        │                                                        │
│        ├─► Verify api_key → userId                             │
│        ├─► Check scopes + rate limit                           │
│        ├─► Business logic + authorization                      │
│        │                                                        │
│        ▼                                                        │
│   Repository Layer (ScopedDB / raw SQL)                        │
│        │                                                        │
│        │ D1_PROXY_SECRET (server-side only)                    │
│        ▼                                                        │
│   zhe-edge Worker /api/d1-query                                │
│        │                                                        │
│        ▼                                                        │
│   D1 Database                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key design principles**:

1. **Worker stays dumb**: SQL proxy doesn't understand users, permissions, or business rules
2. **Auth boundary at Next.js API**: All user-level auth/authz happens here, not at Worker
3. **Blast radius limited**: Leaked api_key = one user's data; leaked D1_PROXY_SECRET = full DB
4. **Future-proof**: Switching from api_key to OAuth device flow only changes API layer, Worker untouched

**Security requirements for api_key**:

| Requirement | Implementation |
|-------------|----------------|
| Storage | Hash only, never store plaintext |
| Key structure | `id`, `prefix`, `userId`, `name`, `scopes`, `createdAt`, `lastUsedAt`, `revokedAt` |
| Rotation | Support key regeneration without losing userId association |
| Revocation | Immediate invalidation via `revokedAt` timestamp |
| Rate limiting | Per-key limits at API layer |
| Audit logging | Record all API calls with key prefix |
| Authorization | Based on `userId` + `scopes`, not just key validity |

**What NOT to do**:

- ❌ CLI → Worker (bypasses auth boundary)
- ❌ API as "DB passthrough" (must enforce business rules)
- ❌ Plain string api_key (must be proper PAT with metadata)
- ❌ Key-valid-means-authorized (must check scopes per endpoint)

**Implementation note**: If using Drizzle ORM at runtime, it may need a custom adapter/proxy driver to work with the Worker SQL proxy. Alternatively, Repository layer can continue using `executeD1Query()` directly.

### Batch Query Support

Currently each `getOverviewStats()` call makes 9 sequential requests. Future optimization:

**Endpoint**: `POST /api/d1-batch`

**Request**:
```json
{
  "queries": [
    { "sql": "SELECT COUNT(*) FROM links WHERE user_id = ?", "params": ["user123"] },
    { "sql": "SELECT COUNT(*) FROM uploads WHERE user_id = ?", "params": ["user123"] }
  ]
}
```

### CLI Business API

> Detailed design is in [CLI Access Architecture](#cli-access-architecture) above.

**Summary**: CLI must use per-user api_key to call business API endpoints, never SQL proxy. Leaked api_key = one user's scoped data; leaked D1_PROXY_SECRET = full DB.

### KV Worker Migration

Future project to move KV operations from REST API to Worker binding, eliminating `CLOUDFLARE_API_TOKEN` from Railway.

---

## CLI Implementation Phases

> **Note**: Business API route names (`/api/links`, `/api/folders`, etc.) are placeholders. Replace with actual route names when implementation begins.

### Phase 1: API Key Infrastructure ✅

**Goal**: Build the api_key system without any CLI yet.

**Status**: Completed (PR #1 merged 2026-04-12)

| Commit | Scope | Description | Status |
|--------|-------|-------------|--------|
| 1.1 | Schema | `feat(db): add api_keys table migration` | ✅ `2fb15cc` |
| | | - `id`, `prefix`, `key_hash`, `user_id`, `name`, `scopes`, `created_at`, `last_used_at`, `revoked_at` | |
| 1.2 | Model | `feat(models): add api-key model with hash/verify` | ✅ `ab4091b` |
| | | - `hashApiKey()`, `verifyApiKey()`, `generateApiKey()` with prefix | |
| | | - Unit tests for hash/verify round-trip | |
| 1.3 | ScopedDB | `feat(db): add api_keys CRUD to ScopedDB` | ✅ `ea8e7dd` |
| | | - `getApiKeys()`, `createApiKey()`, `revokeApiKey()`, `updateApiKeyLastUsed()` | |
| | | - Integration tests | |
| 1.4 | Actions | `feat(actions): add api-keys server actions` | ✅ `da62419` |
| | | - `createApiKey()`, `listApiKeys()`, `revokeApiKey()` | |
| 1.5 | UI | `feat(settings): add API keys management UI` | ✅ `a790a07` |
| | | - List keys (show prefix only), create, revoke | |
| | | - Show full key only once on creation | |

### Phase 2: API Auth Middleware ✅

**Goal**: Build reusable auth middleware for API routes.

**Status**: Completed (2026-04-12)

| Commit | Scope | Description | Status |
|--------|-------|-------------|--------|
| 2.1 | Middleware | `feat(api): add api-key auth middleware` | ✅ `de957e2` |
| | | - Extract `Authorization: Bearer <key>` header | |
| | | - Verify key, check `revoked_at`, update `last_used_at` | |
| | | - Return `{ userId, scopes }` or 401/403 | |
| 2.2 | Rate limit | `feat(api): add per-key rate limiting` | ✅ `4e571b7` |
| | | - In-memory sliding window (later: Redis/KV) | |
| | | - Return 429 with `Retry-After` header | |
| 2.3 | Audit | `feat(api): add API audit logging` | ✅ `116d3de` |
| | | - Log key prefix, endpoint, timestamp, response status | |
| | | - Fire-and-forget to avoid blocking | |

### Phase 3: Business API Endpoints

**Goal**: Expose typed business endpoints for CLI consumption.

**Status**: Completed (2026-04-12)

| Commit | Scope | Description | Status |
|--------|-------|-------------|--------|
| 3.1 | Links | `feat(api): add /api/v1/links endpoint` | ✅ `3b786b3` |
| | | - `GET` (list), `POST` (create) | |
| | | - Scope check: `links:read`, `links:write` | |
| | | - Uses ScopedDB internally | |
| 3.2 | Links | `feat(api): add /api/v1/links/[id] endpoint` | ✅ `7d3cac6` |
| | | - `GET` (detail), `PATCH` (update), `DELETE` | |
| 3.3 | Folders | `feat(api): add /api/v1/folders endpoints` | ✅ `d80aa4b` |
| | | - `GET` (list), `POST` (create) | |
| | | - `GET`, `PATCH`, `DELETE` for `[id]` | |
| | | - Scope: `folders:read`, `folders:write` | |
| 3.4 | Uploads | `feat(api): add /api/v1/uploads endpoints` | ✅ `19e34c5` |
| | | - `GET` (list), `GET` (detail), `DELETE` | |
| | | - Scope: `uploads:read`, `uploads:write` | |
| 3.5 | Tags | `feat(api): add /api/v1/tags endpoints` | ✅ `d533148` |
| | | - `GET` (list), `POST` (create) | |
| | | - `GET`, `PATCH`, `DELETE` for `[id]` | |
| | | - Scope: `tags:read`, `tags:write` | |

### Phase 4: CLI Implementation

**Goal**: Build the CLI tool that consumes the business API.

| Commit | Scope | Description |
|--------|-------|-------------|
| 4.1 | CLI scaffold | `feat(cli): initialize CLI project` |
| | | - Separate package or monorepo workspace |
| | | - Config file for api_key storage |
| 4.2 | Auth | `feat(cli): add auth commands` |
| | | - `zhe auth login` — prompt for api_key, store securely |
| | | - `zhe auth logout` — clear stored key |
| | | - `zhe auth status` — show current user |
| 4.3 | Links | `feat(cli): add link commands` |
| | | - `zhe link create <url>` |
| | | - `zhe link list` |
| | | - `zhe link delete <id>` |
| 4.4 | Folders | `feat(cli): add folder commands` |
| 4.5 | Interactive | `feat(cli): add interactive mode` |
| | | - `zhe` without args opens TUI |

### Phase 5: Migration from Webhook Token

**Goal**: Deprecate old webhook-style auth, migrate to api_key.

| Commit | Scope | Description |
|--------|-------|-------------|
| 5.1 | Deprecation | `chore(api): mark webhook token as deprecated` |
| | | - Add deprecation warning header to `/api/link/create/[token]` |
| | | - Log usage for migration tracking |
| 5.2 | Migration | `feat(settings): add webhook-to-apikey migration` |
| | | - One-click create api_key with same permissions |
| 5.3 | Docs | `docs: update API documentation for v1 endpoints` |
| 5.4 | Cleanup | `chore(api): remove deprecated webhook endpoints` |
| | | - Only after migration period (e.g., 3 months) |

---

## Future: OAuth Device Flow

If switching from api_key to OAuth device flow:

1. Update [CLI Access Architecture](#cli-access-architecture) section with OAuth flow
2. Keep [CLI Business API](#cli-business-api) as summary reference
3. API endpoints remain unchanged — only auth layer swaps
4. Worker stays untouched

---

## Related Documents

- [Architecture Overview](01-architecture.md)
- [Database Design](04-database.md)
- [Worker D1 Proxy Design](16-worker-d1-proxy.md)
- [Cloudflare Resource Inventory](14-cloudflare-resource-inventory.md)
