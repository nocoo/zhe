import assert from "node:assert/strict";
import { encode } from "@auth/core/jwt";
import { expect, test as setup } from "@playwright/test";
import { islandHeading } from "./helpers/chrome";
import { TEST_USER } from "./helpers/d1";

const authFile = "tests/playwright/.auth/user.json";

setup(
  "nested connector routes reject unauthenticated requests in parent-first order",
  async ({ request }) => {
    for (const [method, path] of [
      ["POST", "/api/v1/connector"],
      ["POST", "/api/v1/connector/jobs/1"],
      ["PUT", "/api/v1/connector/jobs/1/media/12345678-1234-1234-1234-123456789012"],
    ] as const) {
      const response = await request.fetch(path, { method });
      expect(response.status(), `${method} ${path}`).toBe(401);
      expect(await response.json()).toEqual({ error: "Missing Authorization header" });
    }
  },
);

setup("authenticate", async ({ page, context, baseURL }) => {
  assert(baseURL === "http://localhost:27006");
  const secret = process.env.AUTH_SECRET;
  assert(secret);
  const value = await encode({
    token: { sub: TEST_USER.id, name: TEST_USER.name, email: TEST_USER.email },
    secret,
    salt: "authjs.session-token",
  });
  await context.addCookies([
    { name: "authjs.session-token", value, url: baseURL, httpOnly: true, sameSite: "Lax" },
  ]);
  await page.goto("/dashboard");
  await expect(islandHeading(page, "全部链接")).toBeVisible();
  await context.storageState({ path: authFile });
});
