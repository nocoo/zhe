import { expect, test as setup } from "@playwright/test";
import { islandHeading } from "./helpers/chrome";

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
  expect(baseURL).toBe("http://localhost:27006");
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with fixture account" }).click();
  await expect(page).toHaveURL(/\/dashboard\/overview/);
  await page.goto("/dashboard");
  await expect(islandHeading(page, "全部链接")).toBeVisible();
  await context.storageState({ path: authFile });
});
