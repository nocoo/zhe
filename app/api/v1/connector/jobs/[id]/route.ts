import { type NextRequest, NextResponse } from "next/server";
import {
  authorizeConnector,
  connectorFailure,
  connectorResponse,
  jobParams,
  readConnectorJson,
} from "@/lib/connector/http";
import {
  completeXBookmark,
  failXBookmark,
  renewXBookmark,
  stageXCapture,
} from "@/lib/connector/jobs";
import { reserveXMedia } from "@/lib/connector/media";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeConnector(request);
    if (auth instanceof NextResponse) return auth;
    const { id, token } = jobParams((await context.params).id, request);
    const body = await readConnectorJson(request);
    let ok: boolean;
    switch (body.action) {
      case "renew":
        ok = await renewXBookmark(auth, id, token);
        break;
      case "capture":
        ok = await stageXCapture(auth, id, token, body.capture);
        break;
      case "complete":
        ok = await completeXBookmark(auth, id, token);
        break;
      case "fail":
        ok = await failXBookmark(auth, id, token, String(body.code));
        break;
      case "reserve": {
        const asset = await reserveXMedia(auth, id, token, body.media);
        return asset
          ? connectorResponse({ asset })
          : connectorResponse({ error: "lease_lost" }, 409);
      }
      default:
        return connectorResponse({ error: "invalid_action" }, 400);
    }
    return ok ? connectorResponse({ ok: true }) : connectorResponse({ error: "lease_lost" }, 409);
  } catch (error) {
    return connectorFailure(error);
  }
}
