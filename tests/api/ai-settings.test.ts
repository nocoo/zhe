import { describe, expect, it } from "vitest";
import { apiGet, apiPost, jsonResponse } from "./helpers/http";

describe("AI settings and suggest routes", () => {
  it("GET /api/settings/ai unauth → 401", async () => {
    const res = await apiGet("/api/settings/ai");
    const { status, body } = await jsonResponse<{ error: string }>(res);
    expect(status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("POST /api/settings/ai/test without session → 401", async () => {
    const res = await apiPost("/api/settings/ai/test", null);
    expect(res.status).toBe(401);
  });

  it("POST /api/ai/suggest-link-org without session → 401", async () => {
    const res = await apiPost("/api/ai/suggest-link-org", { linkId: 1 });
    expect(res.status).toBe(401);
  });
});
