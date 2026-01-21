# Project Development Document: Zhe (这) - Minimalist URL Shortener Service

## 1. Project Overview

**Project Name**: zhe (这)
**Description**: A minimalist URL shortener service based on Cloudflare D1 and Next.js.
**Production Domain**: `zhe.to`
**Core Features**:

* **URL Redirection**: High-performance edge-side redirection.
* **Generation Modes**: Support for "Minimal Mode" (random Hash) and "Custom Mode" (user-specified alias).
* **Management System**: Folder-based link management (CRUD).
* **Analytics**: Detailed click log analysis.
* **Access Control**: Only logged-in users can create/manage links, using Google OAuth.

## 2. Tech Stack Architecture

* **Runtime**: Bun
* **Package Manager**: npm (fallback from pnpm)
* **Framework**: Next.js 15 (App Router)
* **Deployment**: Vercel (using Edge Middleware for redirection)
* **Database**: Cloudflare D1 (Serverless SQLite)
* **ORM**: Drizzle ORM
* **Authentication**: Auth.js (NextAuth v5) with Google Provider
* **UI Components**: Tailwind CSS + Shadcn/UI + Lucide React
* **Testing**: Vitest + React Testing Library + Playwright (E2E)
* **Utilities**: `nanoid` (ID generation), `ua-parser-js` (User Agent parsing)

---

## 3. Why Cloudflare D1 over Supabase?

| Feature | Supabase (Postgres) | Cloudflare D1 (SQLite) |
|---------|---------------------|------------------------|
| **Storage Model** | Relational (powerful) | Relational (lightweight) |
| **Free Limits** | 500MB / hibernates | **5GB / never hibernates** |
| **Security** | Built-in RLS | Code-level auth checks |
| **Read/Write Costs** | Limited IO | **Generous (5M reads/day)** |
| **Best For** | Complex apps | **URL shorteners, blogs, configs** |
| **Edge Speed** | Single region | **Global edge distribution** |

**Conclusion**: D1 is perfect for read-heavy, low-write workloads like URL shortening.

---

## 4. Confirmed Requirements

| Item | Decision | Notes |
|------|----------|-------|
| Use Case | Personal use | No complex permission system needed |
| Database | Cloudflare D1 | 5GB free, global edge |
| Auth | Auth.js + Google | Free, simple |
| Security | Code-level checks | Manual `user_id` verification in Server Actions |
| Geo Data | Vercel Geo Headers | Use `x-vercel-ip-country`, `x-vercel-ip-city` |
| Rate Limiting | Not needed (MVP) | Skip for now |
| Slug Collision | Retry generation | Max 3 retries, then error |
| Expired Links | Return 404 | No separate `/expired` page |
| Responsive | Required | Dashboard adapts to mobile |
| Folder Structure | Single level flat | Current design satisfies this |
| Domain | `zhe.to` | Configure Reserved Paths and CORS accordingly |

---

## 5. TDD Strategy & Testing Plan

### 5.1 Testing Stack

```
vitest                  - Unit & Integration tests
@testing-library/react  - Component testing
playwright              - E2E tests (optional, later phase)
```

### 5.2 Coverage Targets

| Phase | Target Coverage | Focus Areas |
|-------|-----------------|-------------|
| Phase 0 | N/A | Static skeleton, no logic |
| Phase 1 | 80%+ | Middleware routing logic |
| Phase 2 | 80%+ | Slug generation, validation, DB operations |
| Phase 3 | 70%+ | Dashboard components |
| Phase 4 | 75%+ | Analytics API |
| **Final** | **80%+ overall** | All business logic |

### 5.3 Test Categories

```
tests/
├── unit/           # Pure function tests (slug validation, nanoid generation)
├── integration/    # API routes, Server Actions
├── components/     # React component tests
└── e2e/            # Playwright E2E tests (future)
```

---

## 6. Progressive Development Phases

### Phase 0: Static Skeleton (First Deploy) ✅

**Goal**: Deploy a working Next.js app to Vercel

**Deliverables**:
- [x] Project initialization (Next.js 15)
- [x] Vitest configuration
- [x] Vercel configuration (`vercel.json`)
- [x] Basic pages: `/`, `/login`, `/dashboard`
- [x] Placeholder middleware (pass-through)
- [x] Smoke tests passing
- [ ] First commit & push to trigger Vercel deploy

**Verification Checklist**:
```
□ `npm run dev` starts without errors (port 7003)
□ Visit http://localhost:7003 shows home page
□ Visit http://localhost:7003/dashboard shows placeholder
□ `npm run test:run` passes (22 tests)
□ Vercel deployment succeeds
□ https://zhe.to shows home page
```

---

### Phase 1: Core Redirect Logic

**Goal**: Middleware can redirect short links (mock data)

**Deliverables**:
- [x] `middleware.ts` with routing logic
- [x] Reserved paths whitelist
- [ ] Mock link lookup (hardcoded for testing)
- [x] 404 page for invalid slugs

**Tests Required**:
- [x] Unit: `isReservedPath()` function
- [x] Unit: `isValidSlug()` function  
- [ ] Integration: Middleware routing behavior

**Verification Checklist**:
```
□ Visit /dashboard → shows dashboard (not redirect)
□ Visit /api/health → returns 200
□ Visit /test-link → redirects (if in mock data) or 404
□ Coverage ≥ 80% for middleware module
```

---

### Phase 2: Cloudflare D1 Integration

**Goal**: Connect to D1 database for link operations

**Deliverables**:
- [ ] Drizzle ORM setup (`lib/db/`)
- [ ] D1 database schema (`lib/db/schema.ts`)
- [ ] Database migrations
- [ ] Server Actions: `createLink`, `getLink`, `deleteLink`
- [ ] Slug generation with collision retry
- [ ] **Security**: All actions verify `session.user.id`

**Tests Required**:
- [ ] Unit: `generateSlug()` with retry logic
- [ ] Unit: Slug validation (reserved words, format)
- [ ] Integration: Server Actions (mocked D1)

**Verification Checklist**:
```
□ Create link via API → stored in D1
□ Visit short link → redirects to original URL
□ Invalid slug → 404
□ Unauthorized user cannot modify others' links
□ Coverage ≥ 80% for actions module
```

---

### Phase 3: Authentication & Dashboard

**Goal**: Login with Google via Auth.js, manage links in dashboard

**Deliverables**:
- [ ] Auth.js configuration with Google Provider
- [ ] Auth middleware (protect `/dashboard`)
- [ ] Dashboard layout (sidebar + header)
- [ ] Links list with CRUD operations
- [ ] Create link modal (minimal + custom modes)

**Tests Required**:
- [ ] Component: Login button renders
- [ ] Component: Dashboard layout renders
- [ ] Component: Link list displays data
- [ ] Integration: Auth flow (mocked)

**Verification Checklist**:
```
□ Visit /login → shows Google login button
□ After login → redirect to /dashboard
□ Dashboard shows user's links
□ Can create new link
□ Can copy, edit, delete links
□ Mobile responsive works
```

---

### Phase 4: Analytics

**Goal**: Track and display click analytics

**Deliverables**:
- [ ] `/api/record-click` route
- [ ] Analytics parsing (UA, Geo from Vercel headers)
- [ ] Click counter increment
- [ ] Analytics dashboard view

**Tests Required**:
- [ ] Unit: UA parsing logic
- [ ] Unit: Geo header extraction
- [ ] Integration: record-click API
- [ ] Component: Analytics charts

**Verification Checklist**:
```
□ Click short link → analytics recorded
□ View link details → shows click stats
□ Country/device breakdown displays
□ Click count increments correctly
```

---

### Phase 5: Polish & Production Ready

**Goal**: Production hardening

**Deliverables**:
- [ ] Error boundaries
- [ ] Loading states
- [ ] SEO meta tags
- [ ] Folder management
- [ ] QR code generation
- [ ] Final UI polish

**Tests Required**:
- [ ] E2E: Full user journey (Playwright)
- [ ] Performance: Lighthouse score > 90

**Verification Checklist**:
```
□ All features working
□ No console errors
□ Mobile experience smooth
□ Coverage ≥ 80% overall
□ Lighthouse performance > 90
```

---

## 7. Database Design (Cloudflare D1 / SQLite)

### 7.1 Schema (SQLite)

```sql
-- Users table (Auth.js will auto-create, shown for reference)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  emailVerified INTEGER,
  image TEXT
);

-- Auth.js required tables
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  sessionToken TEXT UNIQUE NOT NULL,
  userId TEXT NOT NULL,
  expires INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires INTEGER NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Folders table
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Links table
CREATE TABLE links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  folder_id TEXT,
  original_url TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_custom INTEGER DEFAULT 0,
  expires_at INTEGER,
  clicks INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

-- Analytics table
CREATE TABLE analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  country TEXT,
  city TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  referer TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_links_slug ON links(slug);
CREATE INDEX idx_links_user_id ON links(user_id);
CREATE INDEX idx_analytics_link_id ON analytics(link_id);
```

### 7.2 Drizzle Schema (`lib/db/schema.ts`)

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp' }),
  image: text('image'),
});

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const links = sqliteTable('links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  originalUrl: text('original_url').notNull(),
  slug: text('slug').notNull().unique(),
  isCustom: integer('is_custom', { mode: 'boolean' }).default(false),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  clicks: integer('clicks').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const analytics = sqliteTable('analytics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  linkId: integer('link_id').notNull().references(() => links.id, { onDelete: 'cascade' }),
  country: text('country'),
  city: text('city'),
  device: text('device'),
  browser: text('browser'),
  os: text('os'),
  referer: text('referer'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
```

---

## 8. Security Model (Code-Level Auth)

Since D1 doesn't have RLS like Supabase, we implement security in Server Actions:

```typescript
// actions/links.ts
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { links } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function deleteLink(linkId: number) {
  const session = await auth();
  
  // 1. Security check: must be logged in
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // 2. Delete: must match BOTH id AND user_id
  const result = await db.delete(links)
    .where(
      and(
        eq(links.id, linkId),
        eq(links.userId, session.user.id) // <-- Manual RLS
      )
    )
    .returning();

  if (result.length === 0) {
    throw new Error("Link not found or access denied");
  }

  return { success: true };
}
```

**Security Checklist for All Server Actions**:
- [ ] Check `session?.user?.id` exists
- [ ] Include `user_id` in WHERE clause for all queries
- [ ] Never trust client-provided user IDs
- [ ] Log security-relevant events

---

## 9. Environment Variables

### Local Development (`.env.local`)

```bash
# Auth.js
AUTH_SECRET=your-auth-secret-generate-with-openssl
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret

# Cloudflare D1 (for local dev, use wrangler)
# D1 binding is injected by Cloudflare runtime

# App
NEXT_PUBLIC_SITE_URL=http://localhost:7003
```

### Production (Vercel + Cloudflare)

```bash
# Auth.js
AUTH_SECRET=your-production-secret
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret

# Cloudflare D1
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_D1_DATABASE_ID=your-d1-database-id
CLOUDFLARE_API_TOKEN=your-api-token

# App
NEXT_PUBLIC_SITE_URL=https://zhe.to
```

---

## 10. Reserved Paths

These paths are reserved and cannot be used as short link slugs:

```typescript
export const RESERVED_PATHS = [
  'login',
  'logout', 
  'auth',
  'callback',
  'dashboard',
  'api',
  'admin',
  '_next',
  'static',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
] as const;
```

---

## 11. File Structure

```
zhe/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   └── dashboard/
│   │       └── page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts
│   │   └── record-click/
│   │       └── route.ts
│   ├── not-found.tsx
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/              # Shadcn components
│   └── ...
├── lib/
│   ├── db/
│   │   ├── index.ts     # Drizzle client
│   │   └── schema.ts    # Drizzle schema
│   ├── constants.ts     # Reserved paths, etc.
│   └── utils.ts
├── actions/
│   ├── links.ts
│   └── folders.ts
├── auth.ts              # Auth.js configuration
├── tests/
│   ├── unit/
│   ├── integration/
│   └── components/
├── middleware.ts
├── vercel.json
├── wrangler.toml        # Cloudflare D1 config
├── drizzle.config.ts    # Drizzle migrations config
├── vitest.config.ts
└── package.json
```

---

## 12. Commit Convention

```
feat: Add new feature
fix: Bug fix
test: Add or update tests
docs: Documentation changes
refactor: Code refactoring
style: Code style changes (formatting)
chore: Build process or auxiliary tool changes
```

Example commits per phase:
- `feat: Initialize Next.js project with Vitest`
- `test: Add smoke tests for basic routes`
- `feat: Implement middleware routing logic`
- `docs: Update tech stack to Cloudflare D1`
- `feat: Add Drizzle ORM schema for D1`
