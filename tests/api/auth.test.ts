import { describe, expect, it } from "vitest";
import { unwrap } from "../test-utils";
import { apiGet, apiGetAuth, getSessionCookie, jsonResponse } from "./helpers/http";

describe("GET /api/auth", () => {
  it("GET /api/auth/csrf returns a csrfToken", async () => {
    const res = await apiGet("/api/auth/csrf");
    const { status, body } = await jsonResponse<{ csrfToken: string }>(res);

    expect(status).toBe(200);
    expect(body.csrfToken).toBeDefined();
    expect(typeof body.csrfToken).toBe("string");
    expect(body.csrfToken.length).toBeGreaterThan(0);
  });

  it("GET /api/auth/providers lists Google without a test login bypass", async () => {
    const res = await apiGet("/api/auth/providers");
    const { status, body } =
      await jsonResponse<
        Record<
          string,
          {
            id: string;
            name: string;
            type: string;
            signinUrl: string;
          }
        >
      >(res);

    expect(status).toBe(200);

    expect(body.google).toBeDefined();
    expect(unwrap(body.google).id).toBe("google");
    expect(unwrap(body.google).type).toBe("oidc");

    expect(body["e2e-credentials"]).toBeUndefined();
  });

  it("GET /api/auth/session verifies the signed local session", async () => {
    const res = await apiGetAuth("/api/auth/session");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: { id: "e2e-test-user-id", email: "e2e@test.local" },
    });
  });

  it("rejects a tampered session cookie", async () => {
    const cookie = await getSessionCookie();
    const res = await apiGet("/api/worker-status", { Cookie: `${cookie}tampered` });
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/session returns empty/null session for unauthenticated request", async () => {
    const res = await apiGet("/api/auth/session");

    expect(res.status).toBe(200);
    const body = await res.json();
    // NextAuth returns null or {} for unauthenticated sessions depending on version
    const isEmpty = body === null || (typeof body === "object" && Object.keys(body).length === 0);
    expect(isEmpty).toBe(true);
  });
});
