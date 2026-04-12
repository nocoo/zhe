# zhe CLI Design

> **Status**: Design phase. Implementation pending.

---

## Overview

`zhe` is a command-line interface for managing short links via the zhe.to API. It provides fast, scriptable access to link CRUD operations without needing a browser.

```
┌──────────────────────────────────────────────────────────┐
│                        zhe CLI                            │
├──────────────────────────────────────────────────────────┤
│  @nocoo/cli-base                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐         │
│  │ Config  │ │  Login  │ │ Update  │ │  Log   │         │
│  └─────────┘ └─────────┘ └─────────┘ └────────┘         │
├──────────────────────────────────────────────────────────┤
│  citty · consola · picocolors · yocto-spinner            │
└──────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────┐
│  zhe.to API v1                                            │
│  Authorization: Bearer zhe_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx│
└──────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Language | TypeScript (strict) |
| CLI Framework | citty (via @nocoo/cli-base) |
| Logging | consola (via @nocoo/cli-base) |
| Config | ConfigManager (via @nocoo/cli-base) |
| Auth | Browser OAuth → API Key |
| HTTP | Native fetch |
| Testing | Vitest (95%+ coverage) |
| Linting | TypeScript + Biome |
| Git Hooks | Husky (6DQ: L1 + G1 pre-commit, G2 pre-push) |

---

## Project Structure

```
zhe-cli/
├── src/
│   ├── index.ts              # Entry point, main command definition
│   ├── commands/
│   │   ├── login.ts          # `zhe login` — Browser OAuth flow
│   │   ├── logout.ts         # `zhe logout` — Clear credentials
│   │   ├── whoami.ts         # `zhe whoami` — Show current user
│   │   ├── list.ts           # `zhe list` — List links
│   │   ├── create.ts         # `zhe create <url>` — Create link
│   │   ├── get.ts            # `zhe get <id>` — Get link details
│   │   ├── update.ts         # `zhe update <id>` — Update link
│   │   ├── delete.ts         # `zhe delete <id>` — Delete link
│   │   └── open.ts           # `zhe open <slug>` — Open short URL in browser
│   ├── api/
│   │   ├── client.ts         # HTTP client with auth, rate limit handling
│   │   └── types.ts          # API request/response types
│   ├── config.ts             # ConfigManager instance
│   └── utils.ts              # Shared utilities (formatters, etc.)
├── tests/
│   ├── commands/             # Command tests
│   └── api/                  # API client tests
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── CLAUDE.md
```

---

## Configuration

### Config File Location

```
~/.config/zhe/config.json      # Production
~/.config/zhe-dev/config.json  # Development (ZHE_DEV=1)
```

### Config Schema

```typescript
interface ZheConfig {
  // API authentication
  apiKey?: string;           // zhe_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  
  // User info (cached from login)
  userId?: string;
  userName?: string;
  userEmail?: string;
  
  // Preferences
  defaultFolderId?: string;  // Default folder for new links
  outputFormat?: "table" | "json" | "minimal";
}
```

### Permissions

- Config file created with `0600` (owner read/write only)
- Handled by `ConfigManager` from `@nocoo/cli-base`

---

## Authentication Flow

### Login

```
┌─────────────────────────────────────────────────────────────┐
│  1. User runs `zhe login`                                   │
│                                                             │
│  2. CLI opens browser: https://zhe.to/cli-auth?nonce=xxx   │
│                                                             │
│  3. User authenticates via GitHub OAuth                     │
│                                                             │
│  4. Server redirects to: http://localhost:PORT/callback     │
│     with ?token=zhe_xxx (newly created API Key)            │
│                                                             │
│  5. CLI captures token, saves to config, closes server      │
│                                                             │
│  6. CLI displays: "✓ Logged in as user@example.com"        │
└─────────────────────────────────────────────────────────────┘
```

### Server-Side Implementation Required

New endpoint: `GET /cli-auth`

1. Redirect to GitHub OAuth with `state` containing nonce
2. On callback, create API Key with scopes `links:read,links:write`
3. Redirect to `http://localhost:PORT/callback?token=zhe_xxx&user=...`

This uses `performLogin()` from `@nocoo/cli-base` which handles:
- Starting local loopback server
- XSS protection via nonce validation
- Browser opening
- Timeout handling

### Token Storage

- API Key stored in config file (not in environment)
- File permissions: `0600`
- Never logged or displayed after initial save

---

## Commands

### Global Options

```
-h, --help       Show help
-v, --version    Show version
--json           Output as JSON (overrides config)
--no-color       Disable colored output
```

### `zhe login`

Authenticate with zhe.to via browser OAuth.

```bash
zhe login
```

**Flow:**
1. Open browser to `https://zhe.to/cli-auth?nonce=xxx`
2. User authenticates, server creates API Key
3. Token saved to config
4. Display success message with user info

**Output:**
```
Opening browser for authentication...
✓ Logged in as user@example.com
```

**Errors:**
- `Login timeout (2 minutes)` — browser not completed in time
- `Login cancelled` — user closed callback without completing

---

### `zhe logout`

Clear stored credentials.

```bash
zhe logout
```

**Output:**
```
✓ Logged out
```

**Behavior:**
- Removes `apiKey`, `userId`, `userName`, `userEmail` from config
- Does NOT revoke the API Key on server (user can do this in dashboard)

---

### `zhe whoami`

Show current authenticated user.

```bash
zhe whoami
```

**Output (authenticated):**
```
user@example.com (John Doe)
API Key: zhe_abcd...wxyz (linked 2026-04-01)
```

**Output (not authenticated):**
```
Not logged in. Run `zhe login` to authenticate.
```

---

### `zhe list`

List all links.

```bash
zhe list [options]
```

**Options:**
```
-f, --folder <id>    Filter by folder ID
-l, --limit <n>      Max results (default: 50, max: 500)
-o, --offset <n>     Pagination offset (default: 0)
--json               Output as JSON
```

**Output (table, default):**
```
ID     SLUG        URL                              CLICKS  CREATED
─────────────────────────────────────────────────────────────────────
123    my-link     https://example.com/page         42      2026-04-01
124    abc123      https://google.com               15      2026-04-02
125    project     https://github.com/user/repo     8       2026-04-03

3 links total
```

**Output (JSON):**
```json
{
  "links": [
    {
      "id": 123,
      "slug": "my-link",
      "originalUrl": "https://example.com/page",
      "shortUrl": "https://zhe.to/my-link",
      "clicks": 42,
      "createdAt": "2026-04-01T00:00:00.000Z"
    }
  ]
}
```

**Output (minimal):**
```
zhe.to/my-link
zhe.to/abc123
zhe.to/project
```

---

### `zhe create <url>`

Create a new short link.

```bash
zhe create <url> [options]
```

**Arguments:**
- `url` (required): The URL to shorten

**Options:**
```
-s, --slug <slug>      Custom slug (auto-generated if not provided)
-f, --folder <id>      Folder ID
-n, --note <text>      Note/description
-e, --expires <date>   Expiration date (ISO 8601)
--copy                 Copy short URL to clipboard
--open                 Open short URL in browser
--json                 Output as JSON
```

**Examples:**
```bash
# Basic usage
zhe create https://example.com/long/path
# Output: ✓ Created https://zhe.to/abc123

# With custom slug
zhe create https://example.com --slug my-link
# Output: ✓ Created https://zhe.to/my-link

# With note and copy to clipboard
zhe create https://example.com -n "Important link" --copy
# Output: ✓ Created https://zhe.to/xyz789 (copied to clipboard)

# JSON output for scripting
zhe create https://example.com --json
# Output: {"link":{"id":123,"slug":"abc123",...}}
```

**Output (default):**
```
✓ Created https://zhe.to/abc123
```

**Output (verbose):**
```
✓ Created link
  Short URL:  https://zhe.to/abc123
  Original:   https://example.com/long/path
  Slug:       abc123 (auto-generated)
  Created:    2026-04-12 09:30:00
```

**Errors:**
- `Slug "xxx" is already in use` — conflict, try different slug
- `Invalid URL format` — malformed URL
- `Expiration date must be in the future` — past date provided

---

### `zhe get <id>`

Get details of a specific link.

```bash
zhe get <id> [options]
```

**Arguments:**
- `id` (required): Link ID (numeric) or slug

**Options:**
```
--json    Output as JSON
```

**Output (default):**
```
Link #123

  Short URL:    https://zhe.to/my-link
  Original:     https://example.com/page
  Slug:         my-link (custom)
  Clicks:       42
  Folder:       Work (folder-id)
  Note:         Important project link
  Expires:      Never
  Created:      2026-04-01 10:00:00
```

**Output (JSON):**
```json
{
  "link": {
    "id": 123,
    "slug": "my-link",
    "originalUrl": "https://example.com/page",
    "shortUrl": "https://zhe.to/my-link",
    "isCustom": true,
    "clicks": 42,
    "folderId": "folder-id",
    "note": "Important project link",
    "expiresAt": null,
    "createdAt": "2026-04-01T10:00:00.000Z"
  }
}
```

**Errors:**
- `Link not found` — ID doesn't exist or belongs to another user

---

### `zhe update <id>`

Update an existing link.

```bash
zhe update <id> [options]
```

**Arguments:**
- `id` (required): Link ID (numeric)

**Options:**
```
-u, --url <url>        New destination URL
-s, --slug <slug>      New slug
-f, --folder <id>      New folder ID (use "none" to remove)
-n, --note <text>      New note (use "" to clear)
-e, --expires <date>   New expiration (use "never" to remove)
--json                 Output as JSON
```

**Examples:**
```bash
# Update URL
zhe update 123 --url https://example.com/new-path

# Update slug
zhe update 123 --slug better-name

# Move to folder
zhe update 123 --folder folder-xyz

# Remove from folder
zhe update 123 --folder none

# Set expiration
zhe update 123 --expires 2027-01-01

# Remove expiration
zhe update 123 --expires never

# Clear note
zhe update 123 --note ""
```

**Output (default):**
```
✓ Updated link #123
  https://zhe.to/better-name → https://example.com/new-path
```

**Errors:**
- `Link not found` — ID doesn't exist
- `Slug "xxx" is already in use` — conflict
- `Invalid URL format` — malformed URL

---

### `zhe delete <id>`

Delete a link.

```bash
zhe delete <id> [options]
```

**Arguments:**
- `id` (required): Link ID (numeric)

**Options:**
```
-y, --yes    Skip confirmation prompt
--json       Output as JSON
```

**Flow:**
```bash
zhe delete 123
# Output: Delete link #123 (https://zhe.to/my-link)? [y/N]
# User types: y
# Output: ✓ Deleted

zhe delete 123 --yes
# Output: ✓ Deleted (no prompt)
```

**Output (JSON):**
```json
{"success": true}
```

**Errors:**
- `Link not found` — ID doesn't exist

---

### `zhe open <slug>`

Open a short URL in the browser.

```bash
zhe open <slug>
```

**Arguments:**
- `slug` (required): The slug to open

**Behavior:**
- Opens `https://zhe.to/<slug>` in default browser
- Does not require authentication (public redirect)

**Output:**
```
Opening https://zhe.to/my-link...
```

---

## API Client

### Base Configuration

```typescript
const API_BASE = "https://zhe.to/api/v1";
const TIMEOUT_MS = 30_000;
```

### Request Headers

```typescript
{
  "Authorization": `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  "User-Agent": "zhe-cli/1.0.0"
}
```

### Rate Limit Handling

The API returns rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1712930400
```

Client behavior:
1. If `X-RateLimit-Remaining` is low, show warning
2. On `429 Too Many Requests`, wait and retry once
3. Display `Retry-After` value to user if still limited

### Error Handling

```typescript
interface ApiError {
  error: string;
}

// HTTP status mapping
const errorMessages: Record<number, string> = {
  400: "Invalid request",
  401: "Not authenticated. Run `zhe login`.",
  403: "Permission denied",
  404: "Not found",
  409: "Conflict",
  429: "Rate limit exceeded",
  500: "Server error",
};
```

---

## Error Messages

### Authentication Errors

| Error | Message |
|-------|---------|
| No API key | `Not authenticated. Run \`zhe login\` first.` |
| Invalid API key | `Authentication failed. Run \`zhe login\` to re-authenticate.` |
| Expired API key | `API key revoked. Run \`zhe login\` to get a new key.` |

### Network Errors

| Error | Message |
|-------|---------|
| Timeout | `Request timed out. Check your connection and try again.` |
| DNS failure | `Could not reach zhe.to. Check your connection.` |
| SSL error | `SSL certificate error. Check your system time.` |

### Validation Errors

| Error | Message |
|-------|---------|
| Invalid URL | `Invalid URL format. Include protocol (https://).` |
| Invalid slug | `Invalid slug. Use only letters, numbers, hyphens, underscores.` |
| Slug taken | `Slug "xxx" is already in use.` |
| Past expiration | `Expiration date must be in the future.` |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Authentication required |
| 4 | Not found |
| 5 | Rate limited |

---

## Testing Strategy

### Unit Tests (L1)

| Component | Coverage Target |
|-----------|----------------|
| API client | 95%+ |
| Commands | 95%+ |
| Config | 95%+ |
| Utils | 95%+ |

### Integration Tests

- Mock API server for HTTP tests
- Real config file operations (temp directory)

### Test Commands

```bash
bun test                 # Run all tests
bun test:coverage        # With coverage report
bun test:watch           # Watch mode
```

---

## Quality Gates

| Gate | Check | Trigger |
|------|-------|---------|
| L1 | Unit tests (95%+ coverage) | pre-commit |
| G1 | tsc --noEmit + Biome lint | pre-commit |
| G2 | gitleaks secret scanning | pre-push |

---

## Release Process

Automated via `scripts/release.ts` (same pattern as cli-base):

1. Run tests + lint
2. Bump version in package.json
3. Generate CHANGELOG entry
4. Commit + tag
5. Push to GitHub
6. Publish to npm as `@nocoo/zhe-cli`
7. Create GitHub release

---

## Installation

### Via npm/bun

```bash
npm install -g @nocoo/zhe-cli
# or
bun add -g @nocoo/zhe-cli
```

### Verify Installation

```bash
zhe --version
# Output: zhe-cli/1.0.0
```

---

## Future Enhancements

### Phase 2: Folders

```bash
zhe folders list
zhe folders create <name> [--icon <emoji>]
zhe folders delete <id>
```

### Phase 3: Bulk Operations

```bash
zhe import <file.csv>    # Bulk create from CSV
zhe export [--format csv|json]  # Export all links
```

### Phase 4: Analytics

```bash
zhe stats <id>           # Show click statistics
zhe stats <id> --chart   # ASCII chart of clicks over time
```

### Phase 5: Interactive Mode

```bash
zhe                      # Enter interactive REPL
> list
> create https://example.com
> exit
```

---

## Server-Side Requirements

### New Endpoint: `/cli-auth`

**Purpose**: OAuth flow that returns an API Key for CLI authentication.

**Implementation**:

```typescript
// app/cli-auth/page.tsx (or route handler)

export default async function CliAuthPage({
  searchParams,
}: {
  searchParams: { nonce?: string; port?: string };
}) {
  const { nonce, port } = searchParams;
  
  // 1. Validate nonce format
  if (!nonce || !port) {
    return <Error message="Invalid request" />;
  }
  
  // 2. Check if user is authenticated
  const session = await auth();
  if (!session?.user?.id) {
    // Redirect to GitHub OAuth with state containing nonce + port
    return redirect(`/api/auth/signin/github?callbackUrl=/cli-auth?nonce=${nonce}&port=${port}`);
  }
  
  // 3. Create API Key for CLI
  const { fullKey, prefix, keyHash } = generateApiKey();
  await db.createApiKey({
    id: nanoid(),
    prefix,
    keyHash,
    userId: session.user.id,
    name: "CLI Login",
    scopes: "links:read,links:write",
  });
  
  // 4. Redirect to local callback with token
  return redirect(`http://localhost:${port}/callback?token=${fullKey}&nonce=${nonce}&user=${session.user.email}`);
}
```

**Security Considerations**:
- Nonce prevents CSRF attacks
- Port validation (must be numeric, reasonable range)
- API Key has limited scopes by default
- User can see and revoke CLI keys in dashboard

---

## Related Documents

- [API v1 Documentation](03-features.md#api-v1推荐)
- [D1 Worker Proxy Migration](17-d1-worker-proxy-migration.md) — security model
- [@nocoo/cli-base README](https://github.com/nocoo/cli-base)
