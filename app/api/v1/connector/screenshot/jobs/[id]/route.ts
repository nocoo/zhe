import { type NextRequest, NextResponse } from "next/server";
import { MAX_SCREENSHOT_BYTES } from "@/cli/src/connector/screenshot-core";
import {
  authorizeConnector,
  connectorFailure,
  connectorResponse,
  jobParams,
  readConnectorJson,
} from "@/lib/connector/http";
import { failScreenshot, renewScreenshot, writeScreenshot } from "@/lib/connector/screenshot-jobs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeConnector(request);
    if (auth instanceof NextResponse) return auth;
    const { id, token } = jobParams((await context.params).id, request);
    const body = await readConnectorJson(request, 1024);
    let ok: boolean;
    if (body.action === "renew") ok = await renewScreenshot(auth, id, token);
    else if (body.action === "fail") ok = await failScreenshot(auth, id, token, String(body.code));
    else return connectorResponse({ error: "invalid_action" }, 400);
    return ok ? connectorResponse({ ok: true }) : connectorResponse({ error: "lease_lost" }, 409);
  } catch (error) {
    return connectorFailure(error);
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeConnector(request);
    if (auth instanceof NextResponse) return auth;
    const { id, token } = jobParams((await context.params).id, request);
    if (!request.body || request.headers.get("content-type") !== "image/webp")
      return connectorResponse({ error: "invalid_screenshot" }, 415);
    if (Number(request.headers.get("content-length")) > MAX_SCREENSHOT_BYTES)
      return connectorResponse({ error: "screenshot_too_large" }, 413);
    const ok = await writeScreenshot(
      auth,
      id,
      token,
      request.headers.get("x-content-sha256") ?? "",
      request.body,
    );
    return ok ? connectorResponse({ ok: true }) : connectorResponse({ error: "lease_lost" }, 409);
  } catch (error) {
    return connectorFailure(error);
  }
}
