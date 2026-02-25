# 08 - Dashboard Performance Optimization

> Status: **Complete**
> Created: 2026-02-26
> Last Updated: 2026-02-26

## Problem Statement

Every dashboard page triggers 5-6+ redundant `auth()` calls (each hitting Cloudflare D1 via HTTP API), eagerly loads data that 6/7 pages don't need, and does zero SSR prefetching — causing visible loading skeleton flashes on every navigation.

## Phase Summary

| Phase | Description | Status | Auth Calls Saved |
|-------|-------------|--------|-----------------|
| 1 | Unify auth helpers + `cache()` wrap | **Done** | -1 (layout) |
| 2 | Merge 3 provider actions into 1 `getDashboardData()` | **Done** | -2 |
| 3 | Reduce unnecessary context subscriptions | **Done** | -3 (re-renders) |
| 4 | SSR prefetch in `page.tsx` via server data functions | **Done** | -1 (page-level) |
| 5 | Backy page: inline history on push, skip refresh on failure | **Done** | -1 |
| 6 | Links N+1: batch `refreshLinkMetadata` | **Done** | -(N-1) |
| 7 | Add Suspense boundaries | **Done** | 0 (UX) |
| 8 | Minor fixes (Storage, Overview) | **Done** | -1 |

## Detailed Phases

### Phase 1: Unify Auth Helpers + `cache()` Wrap

**Problem:** 9+ identical `getScopedDB()`/`getAuthContext()`/`requireAuth()` copy-pasted across action files. `auth()` not deduplicated within server component render.

**Changes:**
- Create `lib/auth-context.ts` with shared `getScopedDB()`, `getAuthContext()`, `requireAuth()`
- Wrap `auth()` with React `cache()` for server component render dedup
- Update all action files to import from shared module
- Delete local helper functions from each action file

**Files Modified:**
- `lib/auth-context.ts` (new)
- `actions/links.ts`
- `actions/tags.ts`
- `actions/folders.ts`
- `actions/xray.ts`
- `actions/backy.ts`
- `actions/webhook.ts`
- `actions/settings.ts`
- `actions/upload.ts`
- `actions/storage.ts`
- `actions/overview.ts`

**Status:** Done (commit `354078e`)

---

### Phase 2: Merge Provider Actions into `getDashboardData()`

**Problem:** `DashboardServiceProvider` fires 3 separate server actions on mount, each calling `auth()` independently = 3 D1 session lookups.

**Changes:**
- Create `getDashboardData()` server action: 1x auth + `Promise.all([getLinks, getTags, getLinkTags])`
- Update `DashboardServiceProvider` to call single action
- Add error handling for the `Promise.all` (Codex finding: failure leaves `loading=true` forever)

**Files Modified:**
- `actions/dashboard.ts` (new)
- `contexts/dashboard-service.tsx`

**Status:** Done (commit `a2e125d`)

---

### Phase 3: Reduce Unnecessary Context Subscriptions

**Problem:** Components subscribed to the full `useDashboardService` context (state + actions), causing unnecessary re-renders when any part of the context changed. Webhook viewmodel pulled the entire dashboard context just for `siteUrl`.

**Changes:**
- Webhook viewmodel: use `window.location.origin` directly, eliminating dashboard context dependency entirely
- Folders viewmodel: use granular `useDashboardState` + `useDashboardActions` hooks instead of monolithic `useDashboardService`
- App sidebar: subscribe to `useDashboardState` only (reads `links` for counts, doesn't need actions)
- Search command dialog: subscribe to `useDashboardState` only (reads state, no actions)
- Update all corresponding test mocks to match new hook usage

**Files Modified:**
- `viewmodels/useWebhookViewModel.ts`
- `viewmodels/useFoldersViewModel.ts`
- `components/app-sidebar.tsx`
- `components/search-command-dialog.tsx`
- `tests/unit/webhook-viewmodel.test.ts`
- `tests/unit/folder-viewmodel.test.ts`
- `tests/components/app-sidebar.test.tsx`
- `tests/components/search-command-dialog.test.tsx`
- `tests/components/dashboard-shell.test.tsx`

**Status:** Done (commit `eca10c3`)

---

### Phase 4: SSR Prefetch in `page.tsx`

**Problem:** All `page.tsx` server components are empty shells. Data fetched client-side via `useEffect` causes loading flashes.

**Changes:**
- Each `page.tsx` made `async`, calls server actions directly to prefetch data
- Data passed as `initialData` prop to client component
- Each viewmodel accepts optional `initialData` param — when provided, `useState` initializes with data, `loading` starts as `false`, and `useEffect` early-returns with `if (initialData) return;`
- No separate `lib/dashboard-data.ts` needed — server actions are callable directly from server components

**Pages converted (6 of 6):**
- Overview: `getOverviewStats()` → `initialData?: OverviewStats`
- Xray: `getXrayConfig()` → `initialData?: XrayInitialData`
- Backy: `getBackyConfig()` + `fetchBackyHistory()` → `initialData?: BackyInitialData`
- Webhook: `getWebhookToken()` → `initialData?: WebhookInitialData`
- Uploads: `getUploads()` → `initialUploads?: Upload[]`
- Storage: `scanStorage()` → `initialData?: StorageScanResult`

**Files Modified:**
- `app/(dashboard)/dashboard/overview/page.tsx`
- `app/(dashboard)/dashboard/xray/page.tsx`
- `app/(dashboard)/dashboard/backy/page.tsx`
- `app/(dashboard)/dashboard/webhook/page.tsx`
- `app/(dashboard)/dashboard/uploads/page.tsx`
- `app/(dashboard)/dashboard/storage/page.tsx`
- `viewmodels/useOverviewViewModel.ts`
- `viewmodels/useXrayViewModel.ts`
- `viewmodels/useBackyViewModel.ts`
- `viewmodels/useWebhookViewModel.ts`
- `viewmodels/useUploadViewModel.ts`
- `components/dashboard/overview-page.tsx`
- `components/dashboard/xray-page.tsx`
- `components/dashboard/backy-page.tsx`
- `components/dashboard/webhook-page.tsx`
- `components/dashboard/upload-list.tsx`
- `components/dashboard/storage-page.tsx`
- `tests/components/overview-route.test.tsx`
- `tests/components/xray-route.test.tsx`
- `tests/components/backy-route.test.tsx`
- `tests/components/webhook-route.test.tsx`
- `tests/components/uploads-route.test.tsx`
- `tests/unit/overview-viewmodel.test.ts`
- `tests/unit/backy-viewmodel.test.ts`
- `tests/unit/webhook-viewmodel.test.ts`
- `tests/unit/upload-viewmodel.test.ts`

**Status:** Done (commit `60d187c`)

---

### Phase 5: Backy Page Optimization

**Problem:** After a successful push, the viewmodel called `fetchBackyHistory()` separately in a `finally` block — an extra auth + DB + external API round-trip. History was also refreshed on push failure (unnecessary).

**Changes:**
- Add `history?: BackyHistoryResponse` field to `BackyPushDetail` type
- `pushBackup()` fetches history inline via GET after successful POST (reuses same `config` — no extra auth/DB call)
- Viewmodel `handlePush` sets history from inline response on success; no `fetchBackyHistory()` call after push
- On push failure, history is NOT refreshed (eliminates wasted round-trip)
- History fetch failure is non-critical — push still succeeds, client can manually refresh

**Files Modified:**
- `models/backy.ts` (added `history` field to `BackyPushDetail`)
- `actions/backy.ts` (inline history fetch on success)
- `viewmodels/useBackyViewModel.ts` (use inline history, remove `finally` block)
- `tests/unit/backy-viewmodel.test.ts` (updated push tests for new behavior)
- `tests/unit/backy-actions.test.ts` (added inline history tests, failure assertion)

**Status:** Done

---

### Phase 6: Links N+1 Batch

**Problem:** Each LinkCard fires `refreshLinkMetadata(linkId)` independently in useEffect. 50 missing = 50 server actions (50 auth calls + 150 D1 queries + 50 HTTP fetches).

**Changes:**
- Add `ScopedDB.getLinksByIds()` with automatic chunking (90 IDs per query) to `lib/db/scoped.ts`
- Create `batchRefreshLinkMetadata(linkIds[])` server action in `actions/links.ts`: 1x auth, batch fetch, concurrent enrichment (limit 5), batch re-fetch
- Remove per-card auto-refresh `useEffect` from `useLinkCardViewModel` (lines 49-61)
- Create `useAutoRefreshMetadata(links, onUpdate)` hook: collects links needing metadata, calls batch action once, tracks processed IDs via ref to prevent re-triggers
- Integrate batch hook in `links-list.tsx` at list level
- Manual single-link refresh (`handleRefreshMetadata`) preserved unchanged

**Files Modified:**
- `lib/db/scoped.ts` (added `getLinksByIds`)
- `actions/links.ts` (added `batchRefreshLinkMetadata`)
- `viewmodels/useLinksViewModel.ts` (removed per-card auto-fetch, added `useAutoRefreshMetadata`)
- `components/dashboard/links-list.tsx` (integrated batch hook)
- `tests/unit/actions.test.ts` (added 6 batch action tests)
- `tests/unit/viewmodels.test.ts` (replaced 5 old auto-fetch tests with 1 + added 7 `useAutoRefreshMetadata` tests)

**Status:** Done (commit `5e594df`)

---

### Phase 7: Suspense Boundaries

**Problem:** Navigating between async dashboard pages shows the previous page lingering until the new page's SSR data finishes loading. No visual feedback during transition.

**Changes:**
- Add `app/(dashboard)/dashboard/loading.tsx` — shared loading skeleton for all dashboard sub-pages
- Provides a generic card grid skeleton that matches the content panel structure
- Each page component retains its own internal skeleton for client-side loading states
- `DashboardServiceProvider` persists in parent `DashboardShell`, unaffected by Suspense boundaries around children

**Files Created:**
- `app/(dashboard)/dashboard/loading.tsx`

**Status:** Done (commit `12e6559`)

---

### Phase 8: Minor Fixes

**Changes:**
- **8a - Storage cleanup optimization**: After `cleanupOrphanFiles()` succeeds, locally remove deleted keys from state and recompute summary via `computeSummary()`. Eliminates a full re-scan (1 auth + 6 D1 COUNT queries + R2 listObjects).
- **8b - Data Management batch import**: Cancelled. The sequential insert-or-skip pattern is correct for D1 (no multi-statement batch support via HTTP API, and each insert needs individual UNIQUE constraint detection).
- **8c - Overview stats copy simplification**: Replace field-by-field stats copy with direct `setStats(result.data)`.

**Files Modified:**
- `components/dashboard/storage-page.tsx` (local state update after cleanup, import `computeSummary`)
- `viewmodels/useOverviewViewModel.ts` (direct assignment)

**Status:** Done (commit `09b5582`)

---

## Auth Call Audit (Before/After)

### Before

| Page | auth() calls on mount |
|------|----------------------|
| Overview | 6 |
| Links List | 5 + N (metadata) |
| Uploads | 6 |
| Xray | 6 |
| Storage | 6 |
| Data Management | 5 |
| Webhook | 6 |
| Backy | 6 |

### Target

| Page | auth() calls on mount |
|------|----------------------|
| All pages | 1-2 |
| Links List | 2 (+ 1 batch metadata) |

## Review Notes

Three AI agents (Codex, Gemini, Claude) reviewed this plan:

- **Codex**: Sidebar + Search Dialog depend on global links data -- must use `getLinkCounts()` for sidebar and lazy-load search. Provider `Promise.all` needs error handling.
- **Gemini**: D1 batch queries have ~32K parameter limit -- need chunking. Import scenario also triggers N+1 metadata refresh.
- **Claude**: Phase 2 (`cache()`) has limited scope -- only dedupes within server render, not across server actions. Create pure server-side read functions separate from server actions.
