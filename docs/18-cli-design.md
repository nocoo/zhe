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

## Design Principles

1. **No server-side changes required for v1**: CLI is a pure client that consumes existing API v1 endpoints
2. **Manual API Key entry**: Users create API Keys in dashboard, paste into CLI
3. **Minimal blast radius**: API Key never exposed in browser history, logs, or URLs
4. **Feature parity with API v1**: Commands map 1:1 to existing endpoints

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Language | TypeScript (strict) |
| CLI Framework | citty (via @nocoo/cli-base) |
| Logging | consola (via @nocoo/cli-base) |
| Config | ConfigManager (via @nocoo/cli-base) |
| Auth | Manual API Key entry (v1) |
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
│   │   ├── login.ts          # `zhe login` — Prompt for API Key
│   │   ├── logout.ts         # `zhe logout` — Clear credentials
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
  
  // Preferences
  defaultFolderId?: string;  // Default folder for new links
  outputFormat?: "table" | "json" | "minimal";
}
```

### Permissions

- Config file created with `0600` (owner read/write only)
- Handled by `ConfigManager` from `@nocoo/cli-base`

---

## Authentication

### Phase 1: Manual API Key Entry (v1)

Users create an API Key in the dashboard (`/dashboard/api-keys`) and paste it into the CLI.

```
┌─────────────────────────────────────────────────────────────┐
│  1. User runs `zhe login`                                   │
│                                                             │
│  2. CLI prompts: "Enter your API Key:"                     │
│     (User pastes: zhe_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)     │
│                                                             │
│  3. CLI validates key format (must start with zhe_)        │
│                                                             │
│  4. CLI makes test request to verify key works             │
│     GET /api/v1/links?limit=1                               │
│                                                             │
│  5. If valid: save to config, display success              │
│     If invalid: display error, don't save                  │
└─────────────────────────────────────────────────────────────┘
```

**Security**:
- API Key entered via stdin, not command line argument (avoids shell history)
- Stored in config file with `0600` permissions
- Never displayed after initial entry (only prefix shown: `zhe_abcd...`)

### Phase 2: Browser OAuth (Future Enhancement)

> **Note**: This requires server-side changes and is deferred to a future release.

If implemented, must use **authorization code flow** with one-time code exchange:

1. CLI opens browser with nonce
2. User authenticates, server generates one-time `code` (not the API Key)
3. Server redirects to `http://localhost:PORT/callback?code=xxx&nonce=yyy`
4. CLI exchanges code for API Key via secure POST request
5. Code is immediately invalidated after use

This avoids exposing the API Key in browser history, URL bars, or logs.

### Token Storage

- API Key stored in config file (not in environment)
- File permissions: `0600`
- Only prefix displayed in CLI output: `zhe_abcd...wxyz`

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

Authenticate by entering an API Key.

```bash
zhe login
```

**Flow:**
1. Prompt for API Key (hidden input)
2. Validate format (`zhe_` prefix, correct length)
3. Test with `GET /api/v1/links?limit=1`
4. If valid: save to config
5. Display result

**Output (success):**
```
Enter your API Key: ************************************
✓ Authenticated successfully
  API Key: zhe_abcd...wxyz
  
To create an API Key, visit: https://zhe.to/dashboard/api-keys
```

**Output (failure):**
```
Enter your API Key: ************************************
✗ Invalid API Key

To create an API Key, visit: https://zhe.to/dashboard/api-keys
```

**Errors:**
- `Invalid API Key format` — doesn't match `zhe_` prefix
- `Authentication failed` — key rejected by server (401)
- `Permission denied` — key lacks `links:read` scope (403)

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
- Removes `apiKey` from config
- Does NOT revoke the API Key on server (user can do this in dashboard)

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

**API Call:**
```
GET /api/v1/links?limit={limit}&offset={offset}&folderId={folderId}
```

**Output (table, default):**
```
ID     SLUG        URL                              CLICKS  CREATED
─────────────────────────────────────────────────────────────────────
123    my-link     https://example.com/page         42      2026-04-01
124    abc123      https://google.com               15      2026-04-02
125    project     https://github.com/user/repo     8       2026-04-03
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

**Note**: Total count not displayed (API doesn't return it). Use `--json` and pipe to `jq length` if needed.

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

**API Call:**
```
POST /api/v1/links
{
  "url": "...",
  "slug": "...",
  "folderId": "...",
  "note": "...",
  "expiresAt": "..."
}
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

**Errors:**
- `Slug "xxx" is already in use` — conflict (409)
- `Invalid URL format` — malformed URL (400)
- `Expiration date must be in the future` — past date (400)

---

### `zhe get <id>`

Get details of a specific link.

```bash
zhe get <id> [options]
```

**Arguments:**
- `id` (required): Link ID (numeric only)

**Options:**
```
--json    Output as JSON
```

**API Call:**
```
GET /api/v1/links/{id}
```

**Output (default):**
```
Link #123

  Short URL:    https://zhe.to/my-link
  Original:     https://example.com/page
  Slug:         my-link (custom)
  Clicks:       42
  Folder:       folder-id
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
- `Link not found` — ID doesn't exist (404)
- `Invalid link ID` — non-numeric ID (400)

**Note**: Only numeric IDs are supported. Slug lookup is not available in v1 API.

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

**API Call:**
```
PATCH /api/v1/links/{id}
{
  "originalUrl": "...",
  "slug": "...",
  "folderId": "..." | null,
  "note": "..." | null,
  "expiresAt": "..." | null
}
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
```

**Errors:**
- `Link not found` — ID doesn't exist (404)
- `Slug "xxx" is already in use` — conflict (409)
- `Invalid URL format` — malformed URL (400)

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

**API Call:**
```
DELETE /api/v1/links/{id}
```

**Flow:**
```bash
zhe delete 123
# Output: Delete link #123? [y/N]
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
- `Link not found` — ID doesn't exist (404)

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
1. If `X-RateLimit-Remaining` is low (< 10), show warning
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
  403: "Permission denied. Check your API Key scopes.",
  404: "Not found",
  409: "Conflict",
  429: "Rate limit exceeded. Try again later.",
  500: "Server error",
};
```

---

## Error Messages

### Authentication Errors

| Error | Message |
|-------|---------|
| No API key | `Not authenticated. Run \`zhe login\` first.` |
| Invalid API key | `Authentication failed. Check your API Key or run \`zhe login\`.` |
| Insufficient scope | `Permission denied. Your API Key lacks the required scope.` |

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
| Invalid ID | `Invalid link ID. Must be a number.` |

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

## Implementation Phases

### Phase 1: Core CRUD (v1.0.0)

Pure client implementation, no server changes required.

| Command | API Endpoint | Status |
|---------|--------------|--------|
| `zhe login` | Manual API Key entry | Planned |
| `zhe logout` | Local config only | Planned |
| `zhe list` | `GET /api/v1/links` | Planned |
| `zhe create` | `POST /api/v1/links` | Planned |
| `zhe get` | `GET /api/v1/links/{id}` | Planned |
| `zhe update` | `PATCH /api/v1/links/{id}` | Planned |
| `zhe delete` | `DELETE /api/v1/links/{id}` | Planned |
| `zhe open` | Browser open (no API) | Planned |

### Phase 2: Browser OAuth Login (Future)

Requires server-side `/cli-auth` endpoint with authorization code flow.

**Security requirements**:
- One-time authorization code, not API Key in URL
- Code exchanged for API Key via POST request
- Code invalidated immediately after use

### Phase 3: Folders

```bash
zhe folders list         # GET /api/v1/folders
zhe folders create <name> # POST /api/v1/folders
zhe folders delete <id>  # DELETE /api/v1/folders/{id}
```

### Phase 4: Bulk Operations

```bash
zhe import <file.csv>    # Bulk create from CSV
zhe export [--format csv|json]  # Export all links
```

### Phase 5: Interactive Mode

```bash
zhe                      # Enter interactive REPL
> list
> create https://example.com
> exit
```

---

## API v1 Compatibility Matrix

| CLI Feature | API Endpoint | Supported |
|-------------|--------------|-----------|
| List links | `GET /api/v1/links` | ✅ |
| Create link | `POST /api/v1/links` | ✅ |
| Get link by ID | `GET /api/v1/links/{id}` | ✅ |
| Get link by slug | — | ❌ Not available |
| Update link | `PATCH /api/v1/links/{id}` | ✅ |
| Delete link | `DELETE /api/v1/links/{id}` | ✅ |
| List total count | — | ❌ Not in response |
| User info / whoami | — | ❌ No endpoint |
| Key introspection | — | ❌ No endpoint |

---

## Related Documents

- [API v1 Documentation](03-features.md#api-v1推荐)
- [D1 Worker Proxy Migration](17-d1-worker-proxy-migration.md) — security model
- [@nocoo/cli-base README](https://github.com/nocoo/cli-base)
