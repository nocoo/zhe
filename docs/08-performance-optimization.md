# 08 - Dashboard Performance Optimization

> Status: **In Progress**
> Created: 2026-02-26
> Last Updated: 2026-02-26

## Problem Statement

Every dashboard page triggers 5-6+ redundant `auth()` calls (each hitting Cloudflare D1 via HTTP API), eagerly loads data that 6/7 pages don't need, and does zero SSR prefetching — causing visible loading skeleton flashes on every navigation.

## Phase Summary

| Phase | Description | Status | Auth Calls Saved |
|-------|-------------|--------|-----------------|
| 1 | Unify auth helpers + `cache()` wrap | Pending | -1 (layout) |
| 2 | Merge 3 provider actions into 1 `getDashboardData()` | Pending | -2 |
| 3 | Lazy-load provider data + sidebar `getLinkCounts()` | Pending | -3 (for 6/7 pages) |
| 4 | SSR prefetch in `page.tsx` via server data functions | Pending | -1 (page-level) |
| 5 | Backy page: merge config+history, optimize push flow | Pending | -1 |
| 6 | Links N+1: batch `refreshLinkMetadata` | Pending | -(N-1) |
| 7 | Add Suspense boundaries | Pending | 0 |
| 8 | Minor fixes (Storage, Data Management, Overview) | Pending | varies |

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

**Status:** Pending

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

**Status:** Pending

---

### Phase 3: Lazy-Load Provider Data

**Problem:** All 7 pages load links+tags+linkTags on mount, but only Links List needs them. Sidebar reads `links` for badge counts; Search dialog reads links/tags/linkTags.

**Changes:**
- Create `getLinkCounts()` server action returning only counts (not full arrays)
- Sidebar: use `linkCounts` instead of `links.length`
- Search dialog: lazy-load data only when opened
- Provider: don't fetch links/tags/linkTags eagerly; expose `ensureDataLoaded()` for consumers
- Links List page: call `ensureDataLoaded()` on mount

**Files Modified:**
- `actions/dashboard.ts`
- `contexts/dashboard-service.tsx`
- `components/app-sidebar.tsx`
- `components/search-command-dialog.tsx`
- `components/dashboard/links-list.tsx`

**Status:** Pending

---

### Phase 4: SSR Prefetch in `page.tsx`

**Problem:** All `page.tsx` server components are empty shells. Data fetched client-side via `useEffect` causes loading flashes.

**Changes:**
- Create `lib/dashboard-data.ts` with pure server-side read functions
- Each `page.tsx` prefetches its data and passes as `initialData` prop
- Viewmodels accept `initialData` and skip `useEffect` fetch when present

**Files Modified:**
- `lib/dashboard-data.ts` (new)
- `app/(dashboard)/dashboard/backy/page.tsx`
- `app/(dashboard)/dashboard/overview/page.tsx`
- `app/(dashboard)/dashboard/uploads/page.tsx`
- `app/(dashboard)/dashboard/xray/page.tsx`
- `app/(dashboard)/dashboard/storage/page.tsx`
- `app/(dashboard)/dashboard/webhook/page.tsx`
- Corresponding viewmodels and page components

**Status:** Pending

---

### Phase 5: Backy Page Optimization

**Problem:** Mount waterfall (config then history sequentially), push refreshes history even on failure, redundant auth+DB reads.

**Changes:**
- Create `getBackyConfigAndHistory()` combined server action
- `pushBackup()` returns updated history inline
- Only refresh history on push success

**Files Modified:**
- `actions/backy.ts`
- `viewmodels/useBackyViewModel.ts`

**Status:** Pending

---

### Phase 6: Links N+1 Batch

**Problem:** Each LinkCard fires `refreshLinkMetadata(linkId)` independently in useEffect. 50 missing = 50 server actions.

**Changes:**
- Create `batchRefreshLinkMetadata(linkIds[])` server action with D1 parameter chunking
- Viewmodel collects IDs missing metadata, fires single batch call

**Files Modified:**
- `actions/enrichment.ts`
- `viewmodels/useLinksViewModel.ts`

**Status:** Pending

---

### Phase 7: Suspense Boundaries

**Changes:**
- Add `<Suspense>` wrappers for data-dependent sections
- Add `loading.tsx` for key routes

**Status:** Pending

---

### Phase 8: Minor Fixes

**Changes:**
- Storage: `handleCleanup` reuses cleanup result, avoids re-scan
- Data Management: `importLinks()` uses batch insert with conflict handling
- Overview: remove redundant stats object field-by-field copy

**Status:** Pending

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
