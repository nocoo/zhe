# AI Integration and Link Organization Suggestions

> **Status**: Design (v1.4) · Codex round-4 findings folded in  
> **Date**: 2026-08-23  
> **Related**: gecko `apps/web-dashboard` AI settings + `analyze-core.ts`; `@nocoo/next-ai` `^0.4.0`; `docs/22-design-tokens.md`  
> **Agent entry**: `CLAUDE.md`

---

## 0. Goal

Ship two stacked capabilities. Capability 1 is a hard prerequisite for Capability 2.

| # | Capability | User-visible outcome |
|---|------------|----------------------|
| 1 | Unified AI access via `@nocoo/next-ai` | Settings page: provider, model, API key, custom base URL / SDK / auth. **Test connection succeeds** against the saved (or just-saved) config. |
| 2 | Templated, structured suggestions | For a single link, AI proposes **one or more folder options** and **one or more tag options**. A dialog lists them. User applies with one click, or edits then applies. **Nothing is written until the user confirms.** |

**Non-goals (v1)**

- Auto-run on link create / inbox triage
- User-editable prompt sections in the UI (defaults live in code; override columns are deferred)
- Ideas / todos / uploads suggestions
- Streaming UI
- Daily review / email (gecko-only product)
- Suggesting *new* folders (folders stay a curated tree; AI may only pick an existing folder or Inbox)
- Semantic / embedding search

---

## 1. Current-state audit (facts)

| Fact | Evidence |
|------|----------|
| No `@nocoo/next-ai` / `ai` dependency | root `package.json` |
| Per-user secrets already live on `user_settings` | `lib/db/schema.ts` (`backy_*`, `xray_*`); `lib/db/scoped/settings.ts` |
| Settings writes are column-specific UPSERTs | `scoped/settings.ts` — each feature has its own INSERT/UPDATE; new AI columns must be added to schema **and** to every INSERT that lists columns (or the new columns stay NULL via `DEFAULT`) |
| Latest migration | `drizzle/migrations/0022_add_todo_emoji.sql` → next slot **`0023`** |
| Folders are **flat** (no parent) | `folders` table: `id`, `user_id`, `name`, `icon` |
| Tags are curated, 12-color palette | `models/tags.ts`; management page `/dashboard/tags` |
| Link folder is a single FK; tags are M2M | `links.folder_id`; `link_tags` |
| Existing assign path | `updateLink` + `addTagToLink` / `createTag` (`actions/links.ts`, `actions/tags.ts`) |
| Link edit surface | `link-card-parts/inline-edit-area.tsx` + `TagPicker` |
| Settings nav group | `components/sidebar-parts/nav-config.ts` — 标签 / 存储 / 数据管理 |
| Design tokens | toolbar `Button xs`; settings form `Button sm`; fields `Input size="sm"` in toolbars |
| Gecko reference | custom `AiSettingsSection` + `@nocoo/next-ai/server` `resolveAiConfig` / `createAiModel`; key masked on GET; test route uses stored key |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  /dashboard/settings/ai                                         │
│  AiSettingsPage → useAiSettingsViewModel                        │
│    GET/PUT  /api/settings/ai                                    │
│    POST     /api/settings/ai/test                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ user_settings.ai_*
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  @nocoo/next-ai                                                 │
│    resolveAiConfig(input) → createAiModel(config)               │
│    generateText({ model, prompt, abortSignal })                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  lib/ai/run-task.ts                                             │
│    loadAiSettings → resolve → expandTemplate → generateText     │
│                    → parseJsonResponse → validate schema        │
│                                                                 │
│  lib/ai/tasks/suggest-link-org.ts                               │
│    prompt + JSON contract for folder[] + tag[]                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  POST /api/ai/suggest-link-org  (auth session)                  │
│  SuggestLinkOrgDialog  (client)                                 │
│    select / edit → apply via existing updateLink + tag actions  │
└─────────────────────────────────────────────────────────────────┘
```

**Layering (MVVM, same as Backy/Xray)**

| Layer | Files | Rule |
|-------|-------|------|
| Model | `lib/ai/tasks/*.ts`, `models/ai-settings.ts` | Pure: templates, parse, validate. No React, no D1. |
| Repo | `lib/db/scoped/settings.ts` | Persist `ai_*` columns. Never return raw key to the client. |
| Action / Route | `app/api/settings/ai/**`, `app/api/ai/suggest-link-org/route.ts` | Auth, load key, call `runTask`. |
| ViewModel | `viewmodels/useAiSettingsViewModel.ts`, `viewmodels/useSuggestLinkOrgViewModel.ts` | Toast, dialog state, apply mutations. |
| View | `components/dashboard/ai-settings-page.tsx`, `components/dashboard/suggest-link-org-dialog.tsx` | Tokens from `docs/22`. |

---

## 3. Capability 1 — unified AI access

### 3.1 Package

```bash
# install with a temporary allowed registry (see rules/tool-npm.md)
BUN_CONFIG_REGISTRY=https://mirrors.tencent.com/npm/ bun add @nocoo/next-ai ai @ai-sdk/openai @ai-sdk/anthropic
```

- Import server helpers from `@nocoo/next-ai/server` (not `/server-next`). Zhe is Next.js, but gecko already hit `server-only` / SSR false-positives; `/server` is the verified path.
- Client UI: **do not** mount gecko-style `AiSettingsPanel` if it fights Basalt density. Use SDK constants (`BUILTIN_PROVIDERS`, `isValidProvider`) and Zhe primitives (`Select`, `Input`, `Button size="sm"`), same pattern as gecko's custom `ai-settings.tsx`.
- After install: `rg -c '", "https' bun.lock` must stay `0` (no mirror URLs committed).

### 3.2 Storage

Add nullable columns on **existing** `user_settings` (same pattern as Backy / Xray). No gecko-style KV `settings` table.

Migration `drizzle/migrations/0023_add_ai_settings.sql`:

```sql
ALTER TABLE user_settings ADD COLUMN ai_provider TEXT;
ALTER TABLE user_settings ADD COLUMN ai_api_key TEXT;
ALTER TABLE user_settings ADD COLUMN ai_model TEXT;
ALTER TABLE user_settings ADD COLUMN ai_base_url TEXT;
ALTER TABLE user_settings ADD COLUMN ai_sdk_type TEXT;
ALTER TABLE user_settings ADD COLUMN ai_auth_type TEXT;
```

| Column | Values |
|--------|--------|
| `ai_provider` | `anthropic` / `minimax` / `glm` / `aihubmix` / `custom` |
| `ai_api_key` | raw secret, server-only |
| `ai_model` | provider default or custom string |
| `ai_base_url` | required when provider = `custom`; empty for builtins |
| `ai_sdk_type` | `anthropic` \| `openai`; required when custom |
| `ai_auth_type` | `apiKey` \| `bearer`; custom only |

**At-rest encryption (P2 accepted risk):** `ai_api_key` is stored plaintext, same as `backy_api_key` / `xray_api_token`. v1 does **not** add AEAD. Rotation = user pastes a new key. Revisit only if we encrypt *all* third-party secrets on this row together.

**Why not KV rows?** Zhe already has a wide `user_settings` row and `ScopedDB` helpers per feature. Prompt overrides are out of v1, so we do not need gecko's `ai.prompt.sectionN` keys yet.

**UPSERT must not clobber siblings:** `upsertAiSettings` updates **only** `ai_*` columns on conflict (mirror `upsertBackySettings`). L1 must prove: existing Backy/Xray/preview values survive an AI upsert, and existing `ai_*` values survive a Backy/Xray/preview upsert — both on a fresh row and on a row that already has the other feature set.

**INSERT hygiene**: any `INSERT INTO user_settings (...)` that lists columns must either omit the new ones (they default NULL) or include them. Grep every INSERT on this table when adding the migration (project retro: mock INSERT must read params).

Prod D1 must receive `0023` before release (`wrangler d1 execute zhe-db --remote --file=...`). L2/L3 local stack replays all migrations.

### 3.3 HTTP API

All three routes: session auth (`requireSession` / `getScopedDB`). Not API-key scoped in v1.

#### `GET /api/settings/ai`

Returns:

```ts
{
  provider: string;
  model: string;
  baseURL: string;
  sdkType: string;
  authType: string;
  hasApiKey: boolean;
  apiKeyLast4: string; // last 4 of stored key, or ""
}
```

There is **no** `apiKey` field. The settings input starts empty. A filled key is shown only as “已保存 ···xxxx”.

#### `PUT /api/settings/ai`

Body (partial):

```ts
{
  provider?: string;
  apiKey?: string | null; // omit = keep; string = replace; null = clear
  model?: string;
  baseURL?: string;
  sdkType?: string;
  authType?: string;
}
```

Validation:

- `provider` empty or `isValidProvider`
- `sdkType` ∈ `{ "", "openai", "anthropic" }`
- `authType` ∈ `{ "", "apiKey", "bearer" }`
- Switching **off** custom: persist empty `baseURL` / `sdkType` / `authType` so stale custom rows cannot leak into `resolveAiConfig` (gecko lesson)
- `apiKey` string that looks like a mask (`/^\*+[A-Za-z0-9]{0,4}$/` or equals previous `*+last4`) → `400` “refusing masked placeholder”
- **Merge-then-validate:** load stored row, apply the patch, then validate the **merged** object. If merged `provider === "custom"`, require non-empty `baseURL`, `sdkType`, `authType`, and `model`, and run §3.4 on `baseURL`. A PUT that only sends `{ provider: "custom" }` without the other custom fields → `400 validation`.

Response: same shape as GET.

#### `POST /api/settings/ai/test`

Reads **stored** settings (caller must PUT first — UI does save-then-test, same as gecko).

- Missing provider or key → `400` with envelope §4.5
- `createUserAiModel(stored)` + `generateText({ prompt: "Reply with exactly: OK", maxOutputTokens: 10 })`
- Success → `{ success: true, response, model, provider }`
- Upstream HTTP errors: forward `statusCode` when present, else `502`; lift inner `error.message` from `responseBody` when JSON

### 3.4 Custom `baseURL` (SSRF)

Custom provider turns the origin into an outbound HTTP client. **Re-run this check on persist and on every Test/suggest call** (not persist-only — DNS can change).

1. Parse as absolute URL. Reject credentials in the URL (`user:pass@`).
2. Scheme must be `https:` (no `http:`, no `file:`, no `localhost` scheme tricks).
3. Hostname must not be `localhost`, `*.local`, or an IP in loopback / link-local / private / CGNAT / metadata ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`).
4. `assertSafeAiBaseUrl` is **async**: resolve DNS and reject if **any** A/AAAA is in those ranges. Re-run on persist and on every Test/suggest.
5. `@nocoo/next-ai@0.4.0` `createAiModel` does **not** expose a custom `fetch`. **Single factory** `lib/ai/create-model.ts` `createUserAiModel(settings)`:
   - builtin → `resolveAiConfig` + `createAiModel`
   - custom → after §3.4, `createOpenAI` / `createAnthropic` from **direct** deps `@ai-sdk/openai` / `@ai-sdk/anthropic`, with `fetch: (url, init) => fetch(url, { ...init, redirect: "error" })`
   - `authType === "bearer"` → `headers: { Authorization: \`Bearer ${apiKey}\` }`; `authType === "apiKey"` → SDK default key header only
   Both `POST /api/settings/ai/test` and `runAiTask` **must** call this factory. L1: custom fetch is invoked with `redirect: "error"`.

Helper: `models/ai-base-url.ts` `assertSafeAiBaseUrl(url: string): Promise<void>`. L1 table of blocked destinations.

### 3.5 Settings UI

| Item | Choice |
|------|--------|
| Route | `/dashboard/settings/ai` |
| Nav | 设置 group, **first** item: `{ title: "AI", icon: Sparkles, href: "/dashboard/settings/ai" }` |
| Breadcrumb | `ROUTE_LABELS["/dashboard/settings/ai"] = "AI"` |
| Cmd+K alias | `AI: "ai llm provider key"` in `launcher-groups.tsx` |
| Density | form page → `Button size="sm"`; not `xs` |
| Fields | Provider select, Model select (+ Custom model…), API key password input, Test + Save |
| Custom provider | extra Base URL, SDK type, Auth type |
| Empty provider | disable Test / Save |

Page header: `PageHeader title="AI"` + short description.

Auth-guard / Playwright warmup: add the route next to `data-management` (same list as `tests/playwright/auth.setup.ts` and `navigation.spec.ts`).

### 3.6 “Test 通” definition

A connection is **green** when:

1. User saves a valid provider + key (+ custom fields if custom)
2. Clicks Test
3. Server returns `success: true` and the button/badge shows success for ~4s

L1 covers the route with a mocked `generateText`. L3 covers the UI state machine (save → test → success/error), not a live vendor.

---

## 4. Capability 2 — templated link organization suggestions

### 4.1 Product contract

Trigger: a **Sparkles** control on the link card (view + edit) labelled **「AI 建议」**. Disabled with tooltip if `hasApiKey === false` (read a lightweight flag from dashboard bootstrap or a `GET /api/settings/ai` cache on the VM).

Dialog title: **「整理建议」**. Two sections:

1. **文件夹** — radio list, 1–3 options. Includes current folder as a non-AI row only if we need a “keep” escape; default selection = top AI option.
2. **标签** — checkbox list, 1–5 options. Pre-check the top N (N = `min(3, options.length)`). User can uncheck / check / rename a **new** tag option before apply.

Footer:

- **应用** — writes the selected folder + selected tags
- **取消** — no writes
- Inline edit: folder is pick-only (existing folders). Tag *name* of a “new tag” option is an `Input size="sm"`; existing tags are not renamed here.

**Apply semantics**

| Field | Write |
|-------|-------|
| Folder | `updateLink(id, { folderId })`. `folderId = null` means Inbox. Option must reference an **owned** folder id **or** Inbox. |
| Tags | Call new action `ensureTagOnLink(linkId, name)`. Lookup is case-insensitive; attach is idempotent; create-then-attach if missing. **Guarantee is best-effort:** no unique index in v1, so a concurrent create can yield two case-variant names. On `createTag` failure with “already exists”, re-lookup and attach. **Existing tags on the link are never removed** by Apply. |

**Folder ownership (existing hole):** `lib/db/scoped/links.ts` `updateLink` currently writes `folder_id` without checking the folder’s `user_id`. v1 **must** reject a non-null `folderId` that is missing or owned by another user (`400` “Folder not found”). Same check in the suggest apply VM (defense in depth). L1: cross-user folder id must not stick.

Apply is **not** a D1 transaction (D1 batch `last_insert_rowid` pitfall). Sequence: folder first, then tags. Partial tag failure surfaces a toast and leaves successful writes; retry is safe because attach is idempotent and create is get-or-create. VM refreshes from `handleLinkUpdated` / `handleTagCreated` / `handleLinkTagAdded`.

### 4.2 JSON contract (the template)

The model must return **only** this JSON (no markdown fence required; parser strips ``` if present):

```ts
interface SuggestLinkOrgResult {
  folders: SuggestFolderOption[]; // 1–3 after parse
  tags: SuggestTagOption[];       // 1–5 after parse
}

interface SuggestFolderOption {
  folderId: string | null; // existing folder id, or null = Inbox. Never the string "inbox".
  name: string;            // display; server overwrites from catalog when folderId set
  reason: string;          // one short Chinese sentence, max 80 chars
}

interface SuggestTagOption {
  tagId: string | null;    // existing tag id, or null = create
  name: string;            // 1–30 chars after trim
  reason: string;
}
```

**Hard parse rules** (`models/ai-suggest-link-org.ts`):

1. Strip optional ` ```json ` fence (same as gecko `parseAiResponse`).
2. `JSON.parse`. Structural punctuation must be ASCII (prompt forbids fullwidth commas).
3. `folders` and `tags` must both be arrays. After filtering, **both must still be non-empty** or → `parse_error`.
4. **Normalize first:** missing / `""` `folderId` → `null` (Inbox). Then require `folderId` / `tagId` to be `string | null` (reject numbers / objects). `name` and `reason` must be strings; `reason` trimmed to 80 chars. Drop options that fail this.
5. Inbox is **only** `folderId: null`. Drop options whose `folderId` is `"inbox"` or any other non-catalog string.
6. When `folderId` / `tagId` matches the catalog, **overwrite `name` from the catalog** before dedupe (model display names are not trusted).
7. Deduplicate folders by `folderId` (Inbox once). Deduplicate tags by lowercased catalog/`name`.
8. Drop tag options with empty / >30 char names after `validateTagName`.
9. If `tagId` is set but unknown, treat as new tag (`tagId = null`) and keep `name`.
10. Cap folders at 3, tags at 5, preserving order.
11. If either array is empty after filtering → `parse_error` (do not show an empty dialog).

No `confidence` field in v1 (extra surface, unused by apply).

### 4.3 Prompt template

File: `lib/ai/tasks/suggest-link-org.ts`. Four concatenated sections (gecko shape, **not** user-editable in v1):

| Section | Content |
|---------|---------|
| Role | You are organizing one bookmark for this user. Suggest only. Do not invent folders. |
| Data | Injected via `{{var}}` — see table below |
| Rules | Folder must be an id from the catalog or Inbox. Prefer existing tags. New tags only when no existing tag fits. Chinese `reason`. 1–3 folders, 1–5 tags. |
| Format | Exact JSON schema above. ASCII punctuation outside strings. No trailing commas. No markdown wrapper. |

**Variables** (`expandTemplate` — copy gecko’s `{{word}}` / `{{a.b}}` regex; unknown keys stay literal):

| Key | Source |
|-----|--------|
| `url` | `link.originalUrl` |
| `title` | `metaTitle` or hostname |
| `description` | `metaDescription` or `""` |
| `note` | `link.note` or `""` |
| `currentFolder` | folder name or `Inbox` |
| `currentTags` | comma-separated assigned tag names, or `（无）` |
| `folderCatalog` | multiline `- folderId=null name=Inbox` then `- folderId={id} name={name}` for every folder. Never emit `id=inbox`. |
| `tagCatalog` | multiline `- id={id} name={name}` for every user tag |

Catalogs are the allow-list. The model is instructed not to emit folder ids outside it.

### 4.4 Runner

`lib/ai/run-task.ts`:

```ts
runAiTask(userId, { prompt, parse }): Promise<
  | { ok: true; result: T; model: string; provider: string; durationMs: number }
  | { ok: false; reason: "no_ai_config" | "ai_error" | "parse_error" | "timeout"; message: string }
>
```

- Load `ai_*` from `user_settings`. Missing provider/key → `no_ai_config`.
- `createUserAiModel(settings)` (§3.4).
- `generateText({ prompt, maxOutputTokens: 1024, abortSignal: AbortSignal.timeout(30_000) })`.
- `parse(text)`.
- Never throws for expected failures (gecko `AnalysisOutcome` pattern).

Timeout 30s is enough for a short JSON object; gecko used 120s because of huge daily timelines.

### 4.5 HTTP

`POST /api/ai/suggest-link-org`

Stable error envelope for **all** AI routes (settings + suggest):

```ts
{ error: string; reason: "no_ai_config" | "not_found" | "validation" | "ai_error" | "parse_error" | "timeout" }
```

```ts
// body
{ linkId: number }

// 200
{ folders: SuggestFolderOption[]; tags: SuggestTagOption[]; model: string; provider: string; durationMs: number }

// 400 reason=no_ai_config | validation
// 404 reason=not_found          // unknown or other-user linkId
// 502 reason=ai_error | parse_error
// 504 reason=timeout            // AbortSignal.timeout / TimeoutError only
```

`runAiTask` must emit `reason: "timeout"` separately from `ai_error` so the route can map 504 without string-matching `"timed out"`.

Server loads the link via `ScopedDB` (`404` if not owned), builds catalogs from `getFolders()` + `getTags()` + assigned tags, runs the task. **Does not write** folder/tags.

### 4.6 Client apply path

`useSuggestLinkOrgViewModel`:

- `open(linkId)` → POST suggest → store options + selection
- `apply()` → `updateLink` (folder) then one `ensureTagOnLink` per checked tag. `ensureTagOnLink` returns `{ tag: Tag; attached: boolean }` so the VM can call `handleTagCreated` when the tag is new and `handleLinkTagAdded` when attached.
- No other write APIs.

Dialog lives in `components/dashboard/suggest-link-org-dialog.tsx`. Opened from `link-card` (list + grid) via a `Button size="icon-sm"` with `aria-label="AI 建议"`.

---

## 5. Decisions (locked for v1)

| Topic | Choice | Rejected |
|-------|--------|----------|
| Settings storage | Columns on `user_settings` | gecko KV `settings` table |
| Prompt editor | Code defaults only | gecko 4-section editor |
| New folders | **Not allowed** | AI-created folders |
| New tags | Allowed (`tagId: null` + valid name) | Existing-only tags |
| One task vs two | **One** JSON with both folders and tags | Two sequential LLM calls |
| Auto-apply | Never | Silent write |
| SDK UI kit | Constants + Zhe primitives | Drop-in `AiSettingsPanel` |
| Server import | `@nocoo/next-ai/server` | `/server-next` |

---

## 6. File map

| Path | Role |
|------|------|
| `drizzle/migrations/0023_add_ai_settings.sql` | columns |
| `lib/db/schema.ts` | `userSettings` fields |
| `lib/db/scoped/settings.ts` | `getAiSettings` / `upsertAiSettings` (mask at route, not repo) |
| `lib/db/mappers.ts` | map new columns if `rowToUserSettings` lists fields |
| `models/ai-settings.ts` | last4 helper, provider unions |
| `models/ai-base-url.ts` | `assertSafeAiBaseUrl` |
| `models/ai-suggest-link-org.ts` | parse + filter against catalogs |
| `lib/ai/expand-template.ts` | `{{var}}` expander |
| `lib/ai/create-model.ts` | `createUserAiModel` (builtin vs custom fetch) |
| `lib/ai/run-task.ts` | generateText wrapper (uses `createUserAiModel` only) |
| `lib/ai/tasks/suggest-link-org.ts` | prompt builder |
| `app/api/settings/ai/route.ts` | GET / PUT |
| `app/api/settings/ai/test/route.ts` | POST test |
| `app/api/ai/suggest-link-org/route.ts` | POST suggest |
| `actions/tags.ts` | `ensureTagOnLink` |
| `lib/db/scoped/links.ts` | folder ownership check in `updateLink` |
| `app/(dashboard)/dashboard/settings/ai/page.tsx` | route |
| `components/dashboard/ai-settings-page.tsx` | settings view |
| `components/dashboard/suggest-link-org-dialog.tsx` | dialog view |
| `viewmodels/useAiSettingsViewModel.ts` | settings VM |
| `viewmodels/useSuggestLinkOrgViewModel.ts` | dialog VM |
| `components/sidebar-parts/nav-config.ts` | nav |
| `components/breadcrumbs.tsx` | crumb |
| `components/search-command-dialog-parts/launcher-groups.tsx` | Cmd+K |
| `package.json` / `bun.lock` | `@nocoo/next-ai`, `ai` |

Grep `INSERT INTO user_settings` and update mocks that destructure columns (`tests/setup.ts` and any settings tests).

---

## 7. Atomic commit plan

Each commit independently typechecks / tests. Do **not** bundle infra + model + view.

| # | Commit | Contents |
|---|--------|----------|
| 0 | `docs: add AI link suggestion design` | this file + README index |
| 1 | `chore: add next-ai and ai sdk deps` | `package.json` + `bun.lock` only |
| 2 | `feat: add user_settings AI columns` | migration + schema + mapper + scoped upsert |
| 3 | `feat: add AI settings API` | GET/PUT/test routes + unit tests |
| 4 | `feat: add AI settings page` | page, VM, nav, breadcrumbs, Cmd+K |
| 5 | `feat: add link org suggestion runner` | templates, parse, `run-task`, POST route |
| 6 | `feat: add suggest-link-org dialog` | VM + dialog + `ensureTagOnLink` + folder ownership check + apply |
| 7 | `test: cover AI settings and suggestions` | remaining L1/L2/L3 |

Prod: apply `0023` on `zhe-db` before the release that includes #2.

---

## 8. 6DQ test plan

### L1 (pre-commit, hard)

| Area | Cases |
|------|-------|
| `maskApiKey` | empty, short (<4), normal |
| `expandTemplate` | known key, dotted key, unknown key left intact |
| `parseSuggestLinkOrg` | happy JSON; fenced JSON; fullwidth-comma fails; unknown folderId dropped; empty after filter → throw; tag name 31 chars dropped; unknown tagId → new tag |
| Settings GET | no raw/masked `apiKey` field; `hasApiKey` + `apiKeyLast4` |
| Settings PUT | rejects bad provider / sdkType; omits key keeps previous; rejects `***xxxx` placeholder; `null` clears |
| `assertSafeAiBaseUrl` | https ok; http / localhost / 10.x / 169.254 rejected |
| Settings UPSERT isolation | AI write keeps Backy/Xray; Backy write keeps `ai_*` (fresh + existing rows) |
| Test route | 400 without key; mocked `generateText` success; upstream 401 mapped |
| Suggest route | 400 no config; **404** unknown / other-user link; parse_error → 502; timeout → 504 |
| `useAiSettingsViewModel` | load, save, test success/error |
| `useSuggestLinkOrgViewModel` | open, toggle, apply folder+new tag, apply no-op when nothing selected; retry after partial tag success is idempotent |
| `updateLink` folder ownership | foreign folder id rejected |
| Dialog / settings page | render, disable without key, apply button |

Mock `generateText` and `@nocoo/next-ai/server` in unit tests. Do **not** hit a live vendor in L1.

### L2 (pre-push, hard)

| Spec | Assert |
|------|--------|
| `GET /api/settings/ai` unauth → 401 | |
| `PUT` then `GET` round-trip (masked) | |
| `POST /api/settings/ai/test` without key → 400 | |
| `POST /api/ai/suggest-link-org` without key → 400 `no_ai_config` | |
| `POST` with other user’s `linkId` → **404** `not_found` | |

Live LLM test is **not** an L2 gate.

### L3 (Playwright, on-demand / release preflight)

| Spec | Assert |
|------|--------|
| Nav → `/dashboard/settings/ai`, breadcrumb `AI` | add to `navigation.spec.ts` + warmup |
| Settings: select provider, type key, save, see masked key | |
| Settings: Test with no key → error badge | |
| Link card: AI button disabled (or hidden) when no key | seed user without `ai_api_key` |
| Suggest dialog: **mocked** via a test-only hook **or** skip live call | prefer intercepting `POST /api/ai/suggest-link-org` with a fixture JSON, then apply folder + tag and assert the card updates |

Do not add `test.slow()` per case; wrap the new spec file with the same 60s + 1 retry as `navigation.spec.ts` if first-compile is an issue.

### G1 / G2

- Biome + `tsc` on all new files.
- gitleaks: no sample live keys in fixtures (`sk-test-…` / `zhe_test_…` only).
- osv-scanner on the new lockfile.

### Worker

No reserved-path change. No Worker deploy.

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Custom OpenAI-compatible proxy needs a trailing `/v1` | Document in the settings description; Test button is the oracle |
| Custom URL SSRF | §3.4 blocklist + DNS check before persist/test/suggest |
| Masked key written back | GET never returns `apiKey`; PUT rejects mask-shaped strings |
| Model returns Chinese punctuation as JSON separators | Prompt forbids it; parse fails closed → 502 + toast, user retries |
| Catalog too large for the prompt | Folders + tags are small personal sets; if >200 tags, send names only and drop ids for overflow (v2). v1 sends all. |
| `user_settings` INSERT lists omit new columns | Grep + mapper tests that round-trip `ai_provider` |
| Mirror URL leaks into `bun.lock` | Install with temp `BUN_CONFIG_REGISTRY`; verify no `"https` registry hosts in lock |
| Suggest button on every card increases density | `icon-sm` only; no extra label in the card toolbar |

---

## 10. Out of scope follow-ups

- Prompt section editor (gecko §4) once more tasks exist
- Suggest on create-link modal
- Inbox batch “suggest all uncategorized”
- CLI `zhe ai suggest <slug>`
- Encrypt `ai_api_key` at rest
