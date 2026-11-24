import { expect, test } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Landing page", () => {
  test("renders branding and sign-in button", async ({ page }) => {
    await page.goto("/");
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
