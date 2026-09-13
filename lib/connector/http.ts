import { type NextRequest, NextResponse } from "next/server";
import { ConnectorError, record } from "@/cli/src/connector/core";
import { requireAuthWithRateLimit } from "@/lib/api/auth";
import { executeD1Query } from "@/lib/db/d1-client";
import { ACTIVE_KEY_SQL, activeKeyParams, connectorKeyActive } from "./auth";

export async function authorizeConnector(request: NextRequest) {
  const result = await requireAuthWithRateLimit(request, "connector:write");
  if (result instanceof NextResponse) return result;
  if (!(await connectorKeyActive(result.auth)))
    return connectorResponse(
      { error: "Connector access expired. Create a new CLI key (30-day Connector access)." },
      403,
    );
  const now = Date.now();
  await executeD1Query(
    `INSERT INTO x_connector_presence(key_id,user_id,last_seen_at) SELECT ?,?,? WHERE ${ACTIVE_KEY_SQL}
    ON CONFLICT(key_id) DO UPDATE SET last_seen_at=excluded.last_seen_at`,
    [result.auth.keyId, result.auth.userId, now, ...activeKeyParams(result.auth, now)],
  );
  return result.auth;
}

export function connectorResponse(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function connectorFailure(error: unknown): NextResponse {
  return connectorResponse(
    { error: error instanceof ConnectorError ? error.code : "connector_unavailable" },
    error instanceof ConnectorError ? error.status || 400 : 503,
  );
}
export function jobParams(id: string, request: NextRequest): { id: number; token: string } {
  const token = request.headers.get("x-connector-lease") ?? "";
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !/^[a-f0-9-]{36}$/.test(token))
    throw new ConnectorError("invalid_job", 400);
  return { id: Number(id), token };
}

export async function readConnectorJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw new ConnectorError("invalid_json", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 512_000) throw new ConnectorError("body_too_large", 413);
      chunks.push(value);
    }
    try {
      return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      throw new ConnectorError("invalid_json", 400);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
