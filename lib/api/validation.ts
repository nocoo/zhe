/**
 * Shared API input validation utilities.
 */

import { NextResponse } from 'next/server';
import { apiError } from './auth';

/**
 * Parse and validate pagination parameters from URL search params.
 * Returns validated { limit, offset } or an error response.
 *
 * @param url - The request URL
 * @param maxLimit - Maximum allowed limit (default: 500)
 * @param defaultLimit - Default limit when not specified (default: 100)
 */
export function parsePaginationParams(
  url: URL,
  { maxLimit = 500, defaultLimit = 100 } = {},
): { limit: number; offset: number } | NextResponse {
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  let limit = defaultLimit;
  if (limitParam !== null) {
    // Strict integer parsing: reject floats, trailing chars, etc.
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return apiError("Invalid 'limit' parameter. Must be a non-negative integer.", 400);
    }
    limit = Math.min(parsed, maxLimit);
  }

  let offset = 0;
  if (offsetParam !== null) {
    const parsed = Number(offsetParam);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return apiError("Invalid 'offset' parameter. Must be a non-negative integer.", 400);
    }
    offset = parsed;
  }

  return { limit, offset };
}

/**
 * Parse JSON body from request with proper error handling.
 * Returns the parsed body as Record<string, unknown> or an error response.
 */
export async function parseJsonBody(
  request: Request,
): Promise<Record<string, unknown> | NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON body', 400);
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return apiError('Request body must be an object', 400);
  }

  return body as Record<string, unknown>;
}

/**
 * Type guard to check if a value is a NextResponse (error case).
 */
export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/**
 * Allowed URL protocols for user-provided URLs.
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Validate that a URL string is well-formed and uses an allowed protocol.
 * Returns the parsed URL on success, or an error message string on failure.
 */
export function validateUrl(url: string): URL | string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return 'URL must use http or https protocol';
  }
  return parsed;
}
