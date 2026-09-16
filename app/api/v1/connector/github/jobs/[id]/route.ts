import { type NextRequest, NextResponse } from "next/server";
import { MAX_GITHUB_CAPTURE_BYTES } from "@/cli/src/connector/github-core";
import {
  completeGitHubBookmark,
  failGitHubBookmark,
  renewGitHubBookmark,
} from "@/lib/connector/github-jobs";
import {
  authorizeConnector,
  connectorFailure,
  connectorResponse,
  jobParams,
  readConnectorJson,
} from "@/lib/connector/http";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeConnector(request);
    if (auth instanceof NextResponse) return auth;
    const { id, token } = jobParams((await context.params).id, request);
    const body = await readConnectorJson(request, MAX_GITHUB_CAPTURE_BYTES + 1024);
    let ok: boolean;
    switch (body.action) {
      case "renew":
        ok = await renewGitHubBookmark(auth, id, token);
        break;
      case "complete":
        ok = await completeGitHubBookmark(auth, id, token, body.repository);
        break;
      case "fail":
        ok = await failGitHubBookmark(auth, id, token, String(body.code));
        break;
      default:
        return connectorResponse({ error: "invalid_action" }, 400);
    }
    return ok ? connectorResponse({ ok: true }) : connectorResponse({ error: "lease_lost" }, 409);
  } catch (error) {
    return connectorFailure(error);
  }
}
