# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [v1.3.0] - 2026-02-25

### Added
- Xray bookmarks page with masonry layout and one-click link creation
- Sidebar reorganization into "系统集成" group with Backy, Xray, and file upload pages

### Changed
- Refactor xray actions: extract `xrayFetch()`, `buildCachePayload()`, `updateLinkFromTweet()` helpers to eliminate 4x duplicated fetch calls, 2x duplicated cache payloads, and 3x duplicated metadata/screenshot blocks
- Use masonry layout for bookmarks with inline add button
- Use white background for tweet cards instead of theme-dependent grey

### Fixed
- Auto-refresh backy history on mount and after push
- Restore correct `@radix-ui/react-scroll-area` version (1.2.10)
- Remove dead code: `clearResult`, `clearTestResult`, `clearPushResult`, `tweetToLinkMetadata`, unused `tweetId` return field
- Fix save button showing double icons during loading
- Fix redundant history conditional check
- Simplify MediaGrid ternary, merge UrlMode import, fix template literal

## [v1.2.2] - 2026-02-25

### Added
- Xray API page for tweet content fetching with media, quoted tweets, and preset URL selection
- Tweet cache system with D1 schema, migration, CRUD operations, and auto-integration into link creation and metadata refresh
- Auto-upload tweet images to R2 as link preview screenshots
- Backy remote backup feature: config, connection test, push, and history UI on data management page
- Backy server actions, viewmodel, and model with types, validation, masking, and tag builder
- Backy settings columns migration on user_settings table
- Webhook HEAD handler and enhanced GET with multi-method documentation
- Webhook stats types for richer endpoint responses
- Shared link UI components: DeleteLinkDialog, TagBadge, TagPicker, CopyUrlButton
- Shared `useLinkMutations` hook for unified tag query and mutation operations
- Link enrichment strategy pattern decoupling Twitter-specific logic from core CRUD
- Deterministic `tagColorFromName()` hash for name-based tag coloring
- Enhanced backup format with schema version, full link fields, and link-tag associations
- BackyPushDetail type with timing and request metadata

### Changed
- Refactor inbox-triage, link-card, and edit-link-dialog to use shared components (-334 lines)
- Refactor all tag UI to name-based coloring, fix search-command-dialog, inline list-mode tags
- Refactor tweet card: inline original tweet link, constrain max-width, preserve full image aspect ratio
- Split settings page into separate data-management and webhook pages
- Rename storage title and remove card width constraints
- Align backy UI with surety design system
- Rewrite README to reflect current project state

### Fixed
- Simplify tweet metaTitle to '@username posted on x.com'

## [v1.2.1] - 2026-02-23

### Changed
- Refine versioning workflow in CLAUDE.md: add version references checklist, default patch bump, display format convention (`v`-prefixed), and step-by-step release instructions

## [v1.2.0] - 2026-02-23

### Added
- Storage management page (`/dashboard/storage`) with R2 and D1 usage overview
- Orphan file detection — identify R2 objects not referenced by any D1 record
- Batch orphan cleanup with server-side double-validation before deletion
- Multi-select checkboxes with "select all orphans" capability
- R2 file list with CDN open button (`https://s.zhe.to/{key}`)
- Sort controls for R2 files by upload time and file size
- Summary cards showing total storage, database status, orphan count, and health
- D1 table stats with row counts
- `listR2Objects` and `deleteR2Objects` operations in R2 client
- `warning` and `success` badge variants
- Checkbox UI component (shadcn)

## [1.1.0] - 2026-02-23

### Added
- Fixed preview image for GitHub repository pages — all `github.com/{owner}/{repo}` URLs use a unified screenshot instead of per-link fetching
- On-demand preview fetch via toast-driven UI (replaced auto-screenshot)
- Refresh button in inbox header
- Playwright E2E test infrastructure with D1 global setup/teardown
- Playwright specs for landing, auth guard, navigation, and link CRUD
- Three-layer test coverage: page route tests, component interaction tests, and model unit tests

### Changed
- Unify link card display logic across list and grid modes (favicon, title, note, description, thumbnail)
- Replace raw URL display with clickable title and copy button
- Move screenshot fetch to server action to avoid CORS blocking
- Grid mode meta row now shows slug, click count, and date consistently

### Fixed
- Restore slug display in grid mode meta row
- Return final redirect URL from screenshot.domains for reliable server-side download
- Isolate E2E tests on dedicated port 17005 to avoid dev server conflicts
- Use platform-aware modifier key for Cmd+K test
- Harden E2E credentials provider with email pin and production guard
- Use else-if in session callback to prevent id overwrite

## [1.0.0] - 2026-02-20

### Added
- Short link creation with auto-generated and custom slugs
- Click analytics tracking with device, browser, and referrer breakdowns
- Dashboard with overview stats, click trends, and top links
- Folder system for organizing links with sidebar navigation
- Tag system with color-coded badges and link-tag associations
- Inbox triage view for uncategorized links with inline editing
- File upload with drag-and-drop, R2 storage, and presigned URLs
- PNG-to-JPG auto-conversion with configurable quality
- Link editing dialog with slug, tags, notes, and screenshot URL
- Search command dialog (Cmd+K) with meta, note, and tag search
- Preview style setting (screenshot vs favicon) per user
- Auto-fetch metadata (title, description, favicon) for new links
- Screenshot proxy through R2 for permanent URLs
- Webhook support for external integrations
- Health check (`/api/health`) and liveness probe (`/api/live`) endpoints
- Auth.js authentication with D1 adapter
- Row-level security via ScopedDB
- MVVM architecture with models, viewmodels, and hooks
- Three-layer test suite: unit, component (RTL), and E2E
- Git hooks via husky: pre-commit (UT + lint-staged), pre-push (full test + lint)
- Basalt design system with dark/light theme toggle
- Badge-style login page with themed logo
- Responsive sidebar with collapsed/expanded modes and mobile overlay

### Security
- SSRF defense on screenshot save with protocol whitelist, timeout, and size limit
- R2 key ownership validation to prevent cross-user deletion
- D1 error message sanitization to prevent internal detail leakage
- TOCTOU race elimination in link import via UNIQUE constraint handling

### Performance
- SQL-based analytics aggregation (replaced JS loops)
- Singleton EditLinkDialog (eliminated per-card instances)
- React.memo on LinkCard to skip unnecessary re-renders
- Dual-context split for DashboardService (state vs actions)
- COUNT(1) query for slug existence check
- Composite indexes for analytics aggregation and upload listing
