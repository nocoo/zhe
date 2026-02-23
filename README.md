<p align="center">
  <img src="public/logo-80.png" alt="Zhe Logo" width="80" height="80">
</p>

<h1 align="center">Zhe</h1>

<p align="center">
  <strong>极简短链接服务</strong><br>
  自部署 · 边缘运行 · 隐私优先
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/Cloudflare_D1-edge-orange" alt="Cloudflare D1">
  <img src="https://img.shields.io/badge/coverage-97%25-brightgreen" alt="Coverage">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

---

## Features

- **Short link management** — create, edit, delete short links with custom slugs
- **Analytics** — real-time click tracking, referrer, device and browser breakdown
- **Auto metadata** — fetch title, description, favicon on link creation
- **Folders** — organize links into folders
- **File uploads** — share files via S3-compatible storage with generated short links
- **Inbox triage** — review and organize newly created links
- **Storage management** — R2/D1 usage overview, orphan file detection and batch cleanup
- **Overview dashboard** — stat cards, click trends, top links, device/browser/file-type charts
- **Global search** — `Cmd+K` to search links and folders
- **Dark mode** — follows system theme
- **Google OAuth** — only authorized users can manage links
- **Edge deployment** — Cloudflare D1 for global low-latency access

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
bun run test:e2e:pw         # Playwright E2E (27 specs)
bun run test:coverage       # coverage report
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | [Bun](https://bun.sh) |
| Framework | [Next.js 15](https://nextjs.org) (App Router) |
| Language | TypeScript (strict mode) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) + [Drizzle ORM](https://orm.drizzle.team) (schema only) |
| UI | [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| Auth | [Auth.js v5](https://authjs.dev) (Google OAuth) |
| Storage | Cloudflare R2 (S3-compatible, file uploads & screenshots) |
| Unit/Integration | [Vitest](https://vitest.dev) + [React Testing Library](https://testing-library.com) |
| E2E | [Playwright](https://playwright.dev) |
| Deployment | [Vercel](https://vercel.com) |

## Commands

| Command | Description |
|---------|-------------|
| `bun dev` | Dev server (port 7005) |
| `bun run build` | Production build |
| `bun run lint` | ESLint (zero-warning policy) |
| `bun run test:run` | All unit/integration/component tests |
| `bun run test:unit` | Unit tests only |
| `bun run test:e2e:pw` | Playwright E2E (27 specs, port 17005) |
| `bun run test:e2e:pw:ui` | Playwright UI mode |
| `bun run test:coverage` | Coverage report |

## Project Structure

```
zhe/
├── actions/          # Server Actions ('use server')
├── app/              # Next.js App Router pages
│   ├── (dashboard)/  # Dashboard route group
│   └── api/          # API routes (health, live, lookup, webhook)
├── components/       # React components
│   ├── dashboard/    # Page-level components (links, overview, settings, storage, uploads, inbox)
│   └── ui/           # shadcn/ui primitives (auto-generated, do not edit)
├── contexts/         # React Context (DashboardService)
├── hooks/            # Shared React hooks
├── lib/              # Shared utilities
│   ├── db/           # Database layer (D1 client, ScopedDB, schema)
│   └── r2/           # R2 storage client
├── models/           # Pure business logic (no React dependency)
├── viewmodels/       # MVVM ViewModel hooks
├── tests/
│   ├── unit/         # Unit tests
│   ├── integration/  # Integration tests
│   ├── components/   # Component tests
│   ├── e2e/          # Vitest-based API E2E tests
│   └── playwright/   # Playwright browser E2E specs
├── drizzle/          # Database migrations
├── docs/             # Project documentation
└── scripts/          # Build scripts
```

## Architecture

```
models/ (pure logic) → lib/db/ (data access) → actions/ (Server Actions)
→ viewmodels/ (ViewModel hooks) → components/ (UI)
```

Key design decisions:

- **MVVM** — models hold pure logic, viewmodels manage state, components render UI
- **Raw SQL at runtime** — D1 queries use raw SQL via HTTP API, not the Drizzle query builder (Drizzle is schema-only)
- **ScopedDB** — code-level row security that auto-injects `user_id` into every query
- **Server Actions** — authenticated mutations go through `actions/`, not API routes

## Documentation

| Doc | Content |
|-----|---------|
| [Architecture](docs/01-architecture.md) | Layered design, data flow, core patterns |
| [Getting Started](docs/02-getting-started.md) | Dependencies, env vars, dev setup |
| [Features](docs/03-features.md) | Short links, metadata, uploads, analytics |
| [Database](docs/04-database.md) | Schema, ScopedDB, migrations |
| [Testing](docs/05-testing.md) | Coverage targets, mock strategy, TDD |
| [Deployment](docs/06-deployment.md) | Vercel, D1, security headers, domains |
| [Contributing](docs/07-contributing.md) | Commit conventions, code quality |

## Testing

- **Coverage target**: statements >= 90%, functions >= 85%, branches >= 80%
- **Zero-warning policy**: ESLint `--max-warnings=0`
- **Git hooks** (husky):
  - pre-commit: unit tests + lint-staged
  - pre-push: full test suite + lint + Playwright E2E

| Port | Purpose |
|------|---------|
| 7005 | Development server |
| 17005 | Playwright E2E (auto-managed, isolated) |

## Agent Guide

> For AI coding assistants (Cursor, Claude Code, Copilot, etc.)

- **Test runner**: always use `npx vitest run`, not `bun test`
- **Atomic commits**: one logical change per commit, format `<type>: <description>`
- **Auto-commit**: commit after changes without asking for confirmation
- **Every commit must pass all tests**
- **Update docs when changing code**: docs live in `docs/`, numbered `01-xxx.md`
- **`components/ui/`** is auto-generated by shadcn — do not edit manually
- **Use `next/image`** `<Image>` component, not `<img>`
- **Metadata fetch** uses `void (async () => { ... })()` pattern (fire-and-forget)
- **D1 mocking** in tests uses in-memory SQL simulator (see `tests/setup.ts`)

## License

[MIT](LICENSE) © 2026
