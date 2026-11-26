import { expect, test } from "./fixtures";
import { appTitle } from "./helpers/chrome";

test.describe("Auth guard (unauthenticated)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects /dashboard to landing with callbackUrl and branding", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "");
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/dashboard");
    await expect(page.locator("text=就是这")).toBeVisible();
    await expect(page.getByRole("button", { name: "Local sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute(
      "href",
      "https://github.com/nocoo/zhe",
    );
  });

  test("applies stored dark theme on first paint", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  });
});

test.describe("Auth guard (authenticated)", () => {
  test("can access /dashboard and redirects / to overview", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(appTitle(page, "全部链接")).toBeVisible();
    await page.goto("/");
    await page.waitForURL("**/dashboard/overview");
    await expect(appTitle(page, "概览")).toBeVisible();
  });
});
