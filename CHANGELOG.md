# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
