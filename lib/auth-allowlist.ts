/**
 * Email allowlist enforcement for the NextAuth `signIn` callback.
 *
 * When `AUTH_ALLOWED_EMAILS` is set (comma-separated list, matched
 * case-insensitively), only those emails may authenticate. Any other
 * Google account is rejected at the `signIn` callback boundary, before
 * a session is issued.
 *
 * When `AUTH_ALLOWED_EMAILS` is unset, every Google account that
 * completes OAuth can sign in — this is the legacy behavior and is
 * only safe for personal / single-tenant deployments. Production
 * deployments are expected to set the env var.
 *
 */

export type SignInUser = {
  email?: string | null;
};

export type SignInAccount = {
  provider?: string;
};

export function parseAllowedEmails(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const entries = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length === 0) return null;
  return new Set(entries);
}

export function isEmailAllowed(
  email: string | null | undefined,
  allow: Set<string> | null,
): boolean {
  if (!allow) return true;
  if (!email) return false;
  return allow.has(email.toLowerCase());
}

/**
 * NextAuth-shaped `signIn` callback. Returns `true` to permit sign-in,
 * `false` to deny (NextAuth surfaces deny as `AccessDenied`).
 */
export function signInCallback(args: {
  user?: SignInUser;
  account?: SignInAccount | null | undefined;
}): boolean {
  const allow = parseAllowedEmails(process.env.AUTH_ALLOWED_EMAILS);
  return isEmailAllowed(args.user?.email, allow);
}
