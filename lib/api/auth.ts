/**
 * API Key Authentication Middleware
 *
 * Authenticates requests via `Authorization: Bearer <api_key>` header.
 * Returns user info and scopes on success, or an error response on failure.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyApiKeyAndGetUser, type ApiKeyVerifyResult } from "@/lib/db";
import type { ApiScope } from "@/models/api-key";
import { checkRateLimit, type RateLimitConfig } from "./rate-limit";

export type AuthResult =
  | { success: true; auth: ApiKeyVerifyResult }
  | { success: false; error: string; status: 401 | 403 };

/**
 * Extract and verify API key from Authorization header.
 *
 * @param request - The incoming request
 * @returns AuthResult with user info on success, error details on failure
 */
export async function authenticateApiKey(
  request: NextRequest,
): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");

  // Check header exists
  if (!authHeader) {
    return {
      success: false,
      error: "Missing Authorization header",
      status: 401,
    };
  }

  // Check Bearer format
  if (!authHeader.startsWith("Bearer ")) {
    return {
      success: false,
      error: "Invalid Authorization header format. Expected: Bearer <api_key>",
      status: 401,
    };
  }

  const apiKey = authHeader.slice(7); // Remove "Bearer " prefix

  // Check key format (must start with "zhe_")
  if (!apiKey.startsWith("zhe_")) {
    return {
      success: false,
      error: "Invalid API key format",
      status: 401,
    };
  }

  // Verify key against database
  const auth = await verifyApiKeyAndGetUser(apiKey);
  if (!auth) {
    return {
      success: false,
      error: "Invalid or revoked API key",
      status: 401,
    };
  }

  return { success: true, auth };
}

/**
 * Check if the authenticated user has the required scope.
 *
 * @param auth - The authenticated user info
 * @param requiredScope - The scope required for this operation
 * @returns true if authorized, false otherwise
 */
export function hasScope(auth: ApiKeyVerifyResult, requiredScope: ApiScope): boolean {
  return auth.scopes.includes(requiredScope);
}

/**
 * Create a JSON error response for API routes.
 */
export function apiError(
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    { error: message },
    { status },
  );
}

/**
 * Authenticate and authorize a request in one step.
 * Returns the auth result if successful, or a NextResponse error if not.
 *
 * Usage in API routes:
 * ```ts
 * const authResult = await requireAuth(request, "links:read");
 * if (authResult instanceof NextResponse) return authResult;
 * const { userId, scopes } = authResult;
 * ```
 */
export async function requireAuth(
  request: NextRequest,
  requiredScope: ApiScope,
): Promise<ApiKeyVerifyResult | NextResponse> {
  const result = await authenticateApiKey(request);

  if (!result.success) {
    return apiError(result.error, result.status);
  }

  if (!hasScope(result.auth, requiredScope)) {
    return apiError(
      `Insufficient permissions. Required scope: ${requiredScope}`,
      403,
    );
  }

  return result.auth;
}

/**
 * Authenticate, authorize, and rate-limit a request in one step.
 * Returns the auth result if successful, or a NextResponse error if not.
 *
 * Includes standard rate limit headers in the response.
 *
 * @param request - The incoming request
 * @param requiredScope - The scope required for this operation
 * @param rateLimitConfig - Optional custom rate limit configuration
 * @returns Auth result or NextResponse error (with rate limit headers)
 */
export async function requireAuthWithRateLimit(
  request: NextRequest,
  requiredScope: ApiScope,
  rateLimitConfig?: RateLimitConfig,
): Promise<{ auth: ApiKeyVerifyResult; headers: Record<string, string> } | NextResponse> {
  const result = await authenticateApiKey(request);

  if (!result.success) {
    return apiError(result.error, result.status);
  }

  if (!hasScope(result.auth, requiredScope)) {
    return apiError(
      `Insufficient permissions. Required scope: ${requiredScope}`,
      403,
    );
  }

  // Check rate limit
  const rateLimit = checkRateLimit(result.auth.keyId, rateLimitConfig);
  const rateLimitHeaders = {
    "X-RateLimit-Limit": String(rateLimitConfig?.maxRequests ?? 100),
    "X-RateLimit-Remaining": String(rateLimit.remaining),
    "X-RateLimit-Reset": String(rateLimit.resetAt),
  };

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders,
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  return { auth: result.auth, headers: rateLimitHeaders };
}
