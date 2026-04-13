import { createHash, randomBytes } from "crypto";

/** Prefix for all API keys (visible in UI, used for key identification). */
const KEY_PREFIX = "zhe_";

/** Available API scopes. */
export const API_SCOPES = [
  "links:read",
  "links:write",
  "folders:read",
  "folders:write",
  "tags:read",
  "tags:write",
  "uploads:read",
  "uploads:write",
  "ideas:read",
  "ideas:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** Parse and validate a comma-separated scopes string. */
export function parseScopes(scopesStr: string): ApiScope[] {
  const scopes = scopesStr.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = scopes.filter((s): s is ApiScope =>
    (API_SCOPES as readonly string[]).includes(s)
  );
  if (valid.length !== scopes.length) {
    throw new Error(`Invalid scopes: ${scopes.filter((s) => !valid.includes(s as ApiScope)).join(", ")}`);
  }
  return valid;
}

/** Serialize scopes array to comma-separated string for DB storage. */
export function serializeScopes(scopes: ApiScope[]): string {
  return scopes.join(",");
}

/**
 * Generate a new API key with cryptographically random bytes.
 * Returns { fullKey, prefix, keyHash } — fullKey is shown once to the user.
 */
export function generateApiKey(): { fullKey: string; prefix: string; keyHash: string } {
  const randomPart = randomBytes(24).toString("base64url"); // 32 chars
  const fullKey = `${KEY_PREFIX}${randomPart}`;
  const prefix = fullKey.substring(0, 12); // "zhe_" + 8 chars
  const keyHash = hashApiKey(fullKey);
  return { fullKey, prefix, keyHash };
}

/** SHA-256 hash of a full API key for storage. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Verify a full key against a stored hash. */
export function verifyApiKey(key: string, storedHash: string): boolean {
  const hash = hashApiKey(key);
  // Constant-time comparison to prevent timing attacks
  if (hash.length !== storedHash.length) return false;
  let result = 0;
  for (let i = 0; i < hash.length; i++) {
    result |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}
