import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiGet, apiGetAuth, apiPost, apiPostAuth, apiPutAuth, jsonResponse } from "./helpers/http";
import { executeD1, seedLink } from "./helpers/seed";

const SESSION_USER_ID = "e2e-test-user-id";
const OTHER_USER_ID = "api-ai-other-user";

describe("AI settings and suggest routes", () => {
  let ownedLinkId: number;

  beforeAll(async () => {
    await executeD1(
      "INSERT OR IGNORE INTO users (id, name, email, emailVerified, image) VALUES (?, ?, ?, NULL, NULL)",
      [SESSION_USER_ID, "E2E Test User", "e2e@test.local"],
    );
    await executeD1(
      "INSERT OR IGNORE INTO users (id, name, email, emailVerified, image) VALUES (?, ?, ?, NULL, NULL)",
      [OTHER_USER_ID, "Other AI User", "other-ai@test.local"],
    );
    const owned = await seedLink({
      userId: SESSION_USER_ID,
      originalUrl: "https://example.com/owned-ai",
    });
    ownedLinkId = owned.id;
  });

  afterAll(async () => {
    await executeD1("DELETE FROM links WHERE user_id IN (?, ?)", [SESSION_USER_ID, OTHER_USER_ID]);
    await executeD1("DELETE FROM user_settings WHERE user_id = ?", [SESSION_USER_ID]);
    await executeD1("DELETE FROM users WHERE id = ?", [OTHER_USER_ID]);
  });

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

  it("PUT/GET round-trips public settings without returning the key", async () => {
    const putRes = await apiPutAuth("/api/settings/ai", {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-l2-ai-key-1234",
    });
    const putBody = await jsonResponse<{ hasApiKey: boolean; apiKeyLast4: string }>(putRes);
    expect(putBody.status).toBe(200);
    expect(putBody.body.hasApiKey).toBe(true);
    expect(putBody.body.apiKeyLast4).toBe("1234");
    expect(putBody.body).not.toHaveProperty("apiKey");

    const getRes = await apiGetAuth("/api/settings/ai");
    const getBody = await jsonResponse<{ hasApiKey: boolean; apiKeyLast4: string }>(getRes);
    expect(getBody.status).toBe(200);
    expect(getBody.body.hasApiKey).toBe(true);
    expect(getBody.body.apiKeyLast4).toBe("1234");
    expect(getBody.body).not.toHaveProperty("apiKey");
  });

  it("suggest without a stored key returns no_ai_config", async () => {
    await apiPutAuth("/api/settings/ai", { apiKey: null });
    const res = await apiPostAuth("/api/ai/suggest-link-org", { linkId: ownedLinkId });
    const { status, body } = await jsonResponse<{ reason: string }>(res);
    expect(status).toBe(400);
    expect(body.reason).toBe("no_ai_config");
  });

  it("suggest for another user's link returns 404", async () => {
    const { id } = await seedLink({
      userId: OTHER_USER_ID,
      originalUrl: "https://example.com/other-ai",
    });
    const res = await apiPostAuth("/api/ai/suggest-link-org", { linkId: id });
    const { status, body } = await jsonResponse<{ reason: string }>(res);
    expect(status).toBe(404);
    expect(body.reason).toBe("not_found");
  });
});
