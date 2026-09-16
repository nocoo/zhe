import { type NextRequest, NextResponse } from "next/server";
import { claimGitHubBookmark, connectorStates } from "@/lib/connector/github-jobs";
import { authorizeConnector, connectorFailure, connectorResponse } from "@/lib/connector/http";
import { claimXBookmark } from "@/lib/connector/jobs";
import { executeD1Query } from "@/lib/db/d1-client";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeConnector(request);
    if (auth instanceof NextResponse) return auth;
    const states = await connectorStates(auth.userId);
    const [key] = await executeD1Query<{ expires_at: number | null }>(
      "SELECT expires_at FROM api_keys WHERE id=? AND user_id=?",
      [auth.keyId, auth.userId],
    );
    return connectorResponse({
      states,
      keyPrefix: auth.keyPrefix,
      expiresAt: key?.expires_at == null ? null : key.expires_at * 1000,
    });
  } catch (error) {
    return connectorFailure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeConnector(request);
    if (auth instanceof NextResponse) return auth;
    // Old CLI versions keep receiving only the X jobs they understand.
    const sources = request.headers.get("x-connector-sources")?.split(",") ?? ["x"];
    const github = sources.includes("github") ? await claimGitHubBookmark(auth) : null;
    return connectorResponse({
      job: github ?? (sources.includes("x") ? await claimXBookmark(auth) : null),
    });
  } catch (error) {
    return connectorFailure(error);
  }
}
