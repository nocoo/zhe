import { type NextRequest, NextResponse } from "next/server";
import { CONNECTOR_LIFETIME_MS } from "@/lib/connector/auth";
import { authorizeConnector, connectorFailure, connectorResponse } from "@/lib/connector/http";
import { claimXBookmark } from "@/lib/connector/jobs";
import { executeD1Query } from "@/lib/db/d1-client";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeConnector(request);
    if (auth instanceof NextResponse) return auth;
    const states = await executeD1Query<{ state: string; count: number }>(
      "SELECT state,COUNT(*) AS count FROM x_bookmarks WHERE user_id=? GROUP BY state",
      [auth.userId],
    );
    const [key] = await executeD1Query<{ created_at: number }>(
      "SELECT created_at FROM api_keys WHERE id=? AND user_id=?",
      [auth.keyId, auth.userId],
    );
    return connectorResponse({
      states,
      keyPrefix: auth.keyPrefix,
      expiresAt: Number(key?.created_at) * 1000 + CONNECTOR_LIFETIME_MS,
    });
  } catch (error) {
    return connectorFailure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeConnector(request);
    if (auth instanceof NextResponse) return auth;
    return connectorResponse({ job: await claimXBookmark(auth) });
  } catch (error) {
    return connectorFailure(error);
  }
}
