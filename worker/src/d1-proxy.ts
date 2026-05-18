// ─── D1 Proxy Handlers ──────────────────────────────────────────────────────
//
// Endpoints called by the Railway origin to execute D1 queries via the Worker's
// native binding (much faster than the Cloudflare REST API).

import type { Env } from './types';

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

interface D1ProxyRequest {
  sql: string;
  params?: unknown[];
}

interface D1ProxyResponse {
  success: boolean;
  results?: unknown[];
  meta?: { changes: number; last_row_id: number };
  error?: string;
}

interface D1BatchRequest {
  statements: Array<{ sql: string; params?: unknown[] }>;
}

interface D1BatchResponse {
  success: boolean;
  results?: Array<{ results: unknown[]; meta: { changes: number; last_row_id: number } }>;
  error?: string;
}

/** Verify Authorization: Bearer <D1_PROXY_SECRET>. Returns null on success, or a 401 Response. */
function verifyAuth(request: Request, env: Env): Response | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  if (!timingSafeEqual(token, env.D1_PROXY_SECRET)) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

async function parseJson<T>(request: Request): Promise<T | Response> {
  try {
    return await request.json() as T;
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
}

function buildErrorResponse(err: unknown, fallback: string): Response {
  const message = err instanceof Error ? err.message : String(err);
  if (/unique/i.test(message)) {
    return Response.json({ success: false, error: 'UNIQUE constraint failed' }, { status: 200 });
  }
  console.error('D1 proxy error:', message);
  return Response.json({ success: false, error: fallback }, { status: 200 });
}

/** Handle D1 single-query requests from Railway backend. */
export async function handleD1Query(request: Request, env: Env): Promise<Response> {
  const authError = verifyAuth(request, env);
  if (authError) return authError;

  const parsed = await parseJson<D1ProxyRequest>(request);
  if (parsed instanceof Response) return parsed;

  const { sql, params = [] } = parsed;
  if (typeof sql !== 'string' || !sql.trim()) {
    return Response.json({ success: false, error: 'Missing or empty sql field' }, { status: 400 });
  }

  try {
    const stmt = env.DB.prepare(sql).bind(...params);
    const result = await stmt.all();
    return Response.json({
      success: true,
      results: result.results,
      meta: { changes: result.meta.changes, last_row_id: result.meta.last_row_id },
    } satisfies D1ProxyResponse);
  } catch (err) {
    return buildErrorResponse(err, 'D1 query failed');
  }
}

/** Handle D1 batch (atomic transaction) requests from Railway backend. */
export async function handleD1Batch(request: Request, env: Env): Promise<Response> {
  const authError = verifyAuth(request, env);
  if (authError) return authError;

  const parsed = await parseJson<D1BatchRequest>(request);
  if (parsed instanceof Response) return parsed;

  const { statements } = parsed;
  if (!Array.isArray(statements) || statements.length === 0) {
    return Response.json({ success: false, error: 'Missing or empty statements array' }, { status: 400 });
  }

  const preparedStatements: D1PreparedStatement[] = [];
  for (const stmt of statements) {
    if (typeof stmt.sql !== 'string' || !stmt.sql.trim()) {
      return Response.json({ success: false, error: 'Invalid statement: missing sql' }, { status: 400 });
    }
    preparedStatements.push(env.DB.prepare(stmt.sql).bind(...(stmt.params || [])));
  }

  try {
    const results = await env.DB.batch(preparedStatements);
    return Response.json({
      success: true,
      results: results.map((r) => ({
        results: r.results,
        meta: { changes: r.meta.changes, last_row_id: r.meta.last_row_id },
      })),
    } satisfies D1BatchResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unique/i.test(message)) {
      return Response.json({ success: false, error: 'UNIQUE constraint failed' } satisfies D1BatchResponse);
    }
    console.error('D1 batch error:', message);
    return Response.json({
      success: false,
      error: `D1 batch failed: ${message}`,
    } satisfies D1BatchResponse);
  }
}
