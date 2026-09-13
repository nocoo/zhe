import { type NextRequest, NextResponse } from "next/server";
import {
  authorizeConnector,
  connectorFailure,
  connectorResponse,
  jobParams,
} from "@/lib/connector/http";
import { writeXMedia } from "@/lib/connector/media";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    const auth = await authorizeConnector(request);
    if (auth instanceof NextResponse) return auth;
    const params = await context.params;
    const { id, token } = jobParams(params.id, request);
    if (!request.body || !/^[a-f0-9-]{36}$/.test(params.assetId))
      return connectorResponse({ error: "invalid_media" }, 400);
    const ok = await writeXMedia(auth, id, token, params.assetId, request.body);
    return ok ? connectorResponse({ ok: true }) : connectorResponse({ error: "lease_lost" }, 409);
  } catch (error) {
    return connectorFailure(error);
  }
}
