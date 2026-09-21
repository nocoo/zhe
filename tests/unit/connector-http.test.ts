// @vitest-environment node

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorError } from "@/cli/src/connector/core";
import { authorizeConnector, connectorFailure, readConnectorJson } from "@/lib/connector/http";

const mockRequireAuth = vi.fn();
vi.mock("@/lib/api/auth", () => ({
  requireAuthWithRateLimit: (...args: unknown[]) => mockRequireAuth(...args),
}));

beforeEach(() => {
  mockRequireAuth.mockReset();
});

describe("connectorFailure", () => {
  it("maps plain errors to 503 connector_unavailable", () => {
    const res = connectorFailure(new Error("socket hang up"));
    expect(res.status).toBe(503);
    return res.json().then((body) => expect(body).toEqual({ error: "connector_unavailable" }));
  });

  it("defaults ConnectorError without status to 400", () => {
    const res = connectorFailure(new ConnectorError("invalid_job"));
    expect(res.status).toBe(400);
    return res.json().then((body) => expect(body).toEqual({ error: "invalid_job" }));
  });

  it("keeps an explicit ConnectorError status", () => {
    const res = connectorFailure(new ConnectorError("body_too_large", 413));
    expect(res.status).toBe(413);
  });
});

describe("authorizeConnector", () => {
  it("returns the auth rejection response untouched", async () => {
    const rejection = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    mockRequireAuth.mockResolvedValueOnce(rejection);

    const result = await authorizeConnector({ method: "POST" } as unknown as NextRequest);

    expect(result).toBe(rejection);
    expect(result).toBeInstanceOf(NextResponse);
  });
});

describe("readConnectorJson", () => {
  it("rejects a body-less request as invalid_json", async () => {
    const request = new Request("http://localhost/api/connector/push", { method: "POST" });
    expect(request.body).toBeNull();
    await expect(readConnectorJson(request)).rejects.toMatchObject({
      code: "invalid_json",
      status: 400,
    });
  });
});
