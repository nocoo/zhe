<p align="center">
  <img src="public/logo-128.png" alt="Zhe Logo" width="128" height="128">
</p>

<h1 align="center">Zhe</h1>

<p align="center">
  <strong>Self-hosted URL shortener on the edge</strong><br>
  Cloudflare D1 + KV + R2 + Workers &middot; Next.js 15 &middot; Railway
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/Cloudflare_D1-edge-orange" alt="Cloudflare D1">
  <img src="https://img.shields.io/badge/coverage-97%25-brightgreen" alt="Coverage">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

<p align="center">
  <img src="https://s.zhe.to/dcd0e6e42358/20260305/71bebef9-8e23-4fcf-889c-246e70214054.jpg" alt="Zhe Dashboard Preview" width="720">
</p>

---

## Architecture

Zhe uses four Cloudflare services as its data plane, with a Next.js application on Railway as the control plane. A Cloudflare Worker sits at the edge as a transparent proxy, resolving short links from KV in under 1ms before falling back to the origin.

```
                    ┌─────────────────────────────────────────┐
                    │           Cloudflare Edge               │
                    │                                         │
  User Request      │   ┌──────────┐      ┌──────────────┐   │
 ─────────────────► │   │  Worker   │─────►│   KV Cache   │   │
   zhe.to/abc       │   │ zhe-edge │      │  slug → URL  │   │
                    │   └────┬─────┘      └──────────────┘   │
                    │        │ KV miss / reserved path        │
                    └────────┼────────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────────────────────────────┐
                    │        Railway Origin (Next.js)          │
                    │                                         │
                    │   Middleware ──► LRU Cache ──► D1       │
                    │   Server Actions ──► ScopedDB ──► D1   │
                    │   Presigned URLs ──► R2 (S3 API)       │
                    │   Fire-and-forget ──► KV sync          │
                    └─────────────────────────────────────────┘
```

### Cloudflare Services

| Service | Role | Access Method |
|---------|------|---------------|
| **D1** (SQLite) | Primary database — links, analytics, users, folders, tags, uploads | REST API from Railway |
| **KV** | Edge cache — slug-to-URL mapping for sub-ms redirects | Worker binding (read) + REST API (write) |
| **R2** (S3) | Object storage — file uploads, screenshots, temporary files | S3-compatible API via presigned URLs |
| **Workers** | Edge proxy — KV redirect, geo header mapping, cron triggers | `zhe-edge` deployed via Wrangler |

### Short Link Click (Read Path)

The read path is optimized for latency. Most clicks never leave the Cloudflare edge.

```
1. GET zhe.to/abc
   │
2. Worker checks: root? static? reserved? multi-segment?
   │  → Yes: forward to origin
   │  → No: continue
   │
3. KV.get("abc") → { id, originalUrl, expiresAt }
   │
   ├─ HIT (not expired)
   │   → 307 redirect
   │   → waitUntil: POST /api/record-click (source: "worker")
   │
   └─ MISS / expired / error
       → Forward to origin
       → Middleware: LRU cache check (1000 entries, 60s TTL)
       → LRU miss: D1 query via REST API
       → 307 redirect
       → waitUntil: recordClick (source: "origin")
```

Click analytics are **always fire-and-forget** — the 307 redirect is returned immediately, and the analytics POST happens asynchronously via `waitUntil()`. Every click is tagged with its resolution source (`worker` or `origin`), which doubles as a KV cache hit rate metric on the dashboard.

### Link Creation (Write Path)

The write path goes through the Next.js origin and synchronizes to KV inline.

```
1. User submits URL in dashboard (or POST /api/link/create/{token})
   │
2. Server Action: auth check → ScopedDB(userId)
   │
3. Slug resolution: custom slug or auto-generate
   │
4. D1 INSERT INTO links ... RETURNING *
   │
5. Fire-and-forget (parallel, non-blocking):
   ├── KV PUT slug → { id, originalUrl, expiresAt }
   ├── Tag association (if provided)
   └── Metadata enrichment (fetch title, favicon, description)
   │
6. Return link to client
```

KV is treated as a **disposable cache** — writes are fire-and-forget and never block the user action. On failure, the next click simply falls through to the D1 origin path. A full D1-to-KV sync runs on first dashboard visit after deploy as a consistency safety net.

### Edge KV Acceleration

The Worker resolves short links from KV at the edge without hitting the origin server. Each KV entry stores the minimum data needed for a redirect:

```json
{
  "id": 42,
  "originalUrl": "https://example.com/very-long-url",
  "expiresAt": 1735689600000
}
```

**Sync strategy:** Write-through on every mutation (create, update, delete), plus a full bulk sync on deploy. No cron-based sync — KV consistency is maintained inline.

| Mutation | KV Action |
|----------|-----------|
| Create link | `PUT slug` |
| Update link | `PUT newSlug` + `DELETE oldSlug` (if slug changed) |
| Delete link | `DELETE slug` |

The Worker also maps Cloudflare geo headers to Vercel-style headers so the origin's analytics code works identically regardless of whether traffic arrives via the Worker or directly:

| Cloudflare | Mapped To | Used By |
|------------|-----------|---------|
| `CF-IPCountry` | `x-vercel-ip-country` | `extractClickMetadata()` |
| `request.cf.city` | `x-vercel-ip-city` | `extractClickMetadata()` |

### D1 + ScopedDB

D1 is accessed via Cloudflare's REST API (the Next.js app runs on Railway, not on Workers, so there's no direct binding). All queries go through a single entry point with a 5-second timeout:

```
POST https://api.cloudflare.com/client/v4/accounts/{id}/d1/database/{id}/query
```

**ScopedDB** provides code-level row security. Constructing `new ScopedDB(userId)` binds the user ID once — every subsequent method automatically injects `WHERE user_id = ?`. This makes it structurally impossible to access another user's data:

```ts
const db = new ScopedDB(session.user.id)
const links = await db.getLinks()        // WHERE user_id = ? is automatic
const folders = await db.getFolders()     // same — no way to forget
```

Analytics are scoped through JOINs (`analytics JOIN links ON ... WHERE links.user_id = ?`). D1's ~100 parameter limit is handled with automatic chunking.

### R2 Object Storage

R2 stores user-uploaded files, screenshots, and temporary files. User uploads use **presigned URLs** so large files go directly from the browser to R2 without passing through Railway:

```
1. Client requests upload URL (Server Action)
2. Server generates presigned PUT URL (5 min expiry)
3. Client PUTs file directly to R2
4. Client confirms upload (Server Action records metadata in D1)
```

**Key structure:**
```
{user-hash}/YYYYMMDD/{uuid}.{ext}     # permanent uploads
tmp/{uuid}_{timestamp}.{ext}           # temporary files (auto-cleaned)
```

User folders are isolated with a salted SHA-256 hash of the userId (first 12 hex chars). Temporary files are cleaned up by a Worker cron that runs every 30 minutes, deleting anything in the `tmp/` prefix older than 1 hour.

### Worker Cron

The `zhe-edge` Worker runs a scheduled handler every 30 minutes:

| Schedule | Action | Purpose |
|----------|--------|---------|
| `*/30 * * * *` | `POST /api/cron/cleanup` | Delete expired temporary files from R2 |

KV sync is **not** cron-driven — it happens inline on every mutation and as a bulk safety net on deploy.

---

## Features

- **Short links** — custom or auto-generated slugs, expiration dates, notes, tags
- **Click analytics** — real-time tracking with device, browser, OS, country, city, referer breakdown
- **Edge redirects** — sub-millisecond resolution via Cloudflare KV at 300+ edge locations
- **File uploads** — share files via R2 with generated short links
- **Folders & tags** — organize links with nested folders and color-coded tags
- **Inbox triage** — review and organize newly created links
- **Storage management** — R2/D1 usage overview, orphan file detection, batch cleanup
- **Overview dashboard** — stat cards, click trends, top links, device/browser/file-type charts
- **Global search** — `Cmd+K` to search links and folders
- **Auto metadata** — fetch title, description, favicon on link creation
- **Webhook API** — create links programmatically with token auth
- **Dark mode** — follows system theme
- **Google OAuth** — only authorized users can manage links

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | [Bun](https://bun.sh) |
| Framework | [Next.js 15](https://nextjs.org) (App Router) |
| Language | TypeScript (strict mode) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite at the edge) |
| ORM | [Drizzle](https://orm.drizzle.team) (schema & types only — queries are raw SQL) |
| Edge Cache | [Cloudflare KV](https://developers.cloudflare.com/kv/) |
| Object Storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible) |
| Edge Proxy | [Cloudflare Workers](https://developers.cloudflare.com/workers/) |
| UI | [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| Auth | [Auth.js v5](https://authjs.dev) (Google OAuth) |
| Testing | [Vitest](https://vitest.dev) + [React Testing Library](https://testing-library.com) + [Playwright](https://playwright.dev) |
| Deployment | [Railway](https://railway.com) (origin) + [Cloudflare](https://cloudflare.com) (edge) |

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with the required variables (see [Getting Started](docs/02-getting-started.md)).

### 3. Start dev server

```bash
bun dev
```

Visit [http://localhost:7005](http://localhost:7005)

### 4. Run tests

```bash
bun run test:run            # all unit/integration/component tests
bun run test:e2e:pw         # Playwright E2E
bun run test:coverage       # coverage report
```

## Commands

| Command | Description |
|---------|-------------|
| `bun dev` | Dev server (port 7005) |
| `bun run build` | Production build |
| `bun run lint` | ESLint (zero-warning policy) |
| `bun run test:run` | All unit/integration/component tests |
| `bun run test:unit` | Unit tests only |
| `bun run test:unit:coverage` | Unit tests + coverage gate |
| `bun run test:api` | API E2E tests (mock-level) |
| `bun run test:e2e:pw` | Playwright BDD E2E (port 27005) |
| `bun run test:e2e:pw:ui` | Playwright UI mode |
| `bun run test:coverage` | Coverage report |

## Project Structure

```
zhe/
├── actions/          # Server Actions ('use server')
├── app/              # Next.js App Router pages
│   ├── (dashboard)/  # Dashboard route group
│   └── api/          # API routes (health, live, lookup, record-click, webhook, cron)
├── components/       # React components
│   ├── dashboard/    # Page-level components (links, overview, settings, storage, uploads, inbox)
│   └── ui/           # shadcn/ui primitives (auto-generated, do not edit)
├── contexts/         # React Context (DashboardService)
├── hooks/            # Shared React hooks
├── lib/              # Shared utilities
│   ├── db/           # D1 client, ScopedDB, schema
│   ├── kv/           # KV client, sync logic
│   └── r2/           # R2 storage client (S3 API)
├── models/           # Pure business logic (no React dependency)
├── viewmodels/       # MVVM ViewModel hooks
├── worker/           # Cloudflare Worker (zhe-edge) — standalone project
│   ├── src/          # Worker source (fetch + scheduled handlers)
│   └── test/         # Worker unit tests
├── tests/
│   ├── unit/         # Unit tests
│   ├── integration/  # Integration tests
│   ├── components/   # Component tests
│   ├── api/          # Vitest API E2E tests (mock-level)
│   └── playwright/   # Playwright browser E2E specs
├── drizzle/          # Database migrations
├── docs/             # Project documentation
└── scripts/          # Build scripts
```

## Testing

- **Coverage target**: statements >= 90%, functions >= 85%, branches >= 80%
- **Zero-warning policy**: ESLint `--max-warnings=0`
- **Git hooks** (husky, four-layer architecture):
  - pre-commit: L1 unit tests (with coverage gate) + L2 lint-staged
  - pre-push: L3 API E2E
  - on-demand: L4 Playwright BDD E2E

| Port | Purpose |
|------|---------|
| 7005 | Development server |
| 27005 | Playwright BDD E2E (auto-managed, isolated) |

## Documentation

| Doc | Content |
|-----|---------|
| [Architecture](docs/01-architecture.md) | Layered design, data flow, core patterns |
| [Getting Started](docs/02-getting-started.md) | Dependencies, env vars, dev setup |
| [Features](docs/03-features.md) | Short links, metadata, uploads, analytics |
| [Database](docs/04-database.md) | Schema, ScopedDB, migrations |
| [Testing](docs/05-testing.md) | Coverage targets, mock strategy, TDD |
| [Deployment](docs/06-deployment.md) | Railway, D1, security headers, domains |
| [Contributing](docs/07-contributing.md) | Commit conventions, code quality |
| [Performance](docs/08-performance-optimization.md) | Caching, bundle optimization, runtime perf |
| [E2E Coverage Analysis](docs/09-e2e-coverage-analysis.md) | E2E test coverage matrix, gap analysis |
| [Backy Integration](docs/10-backy.md) | Remote backup via Backy (push/pull) |
| [Four-Layer Test Plan](docs/11-four-layer-test-plan.md) | Test architecture improvement plan & status |

## License

[MIT](LICENSE) © 2026
