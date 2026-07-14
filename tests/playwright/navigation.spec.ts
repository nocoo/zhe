/**
 * E2E: Dashboard navigation — sidebar and page switching.
 *
 * Verifies the sidebar renders all nav sections and that
 * clicking nav items switches the main content area.
 */

import { request as playwrightRequest } from "@playwright/test";
import { expect, test } from "./fixtures";

test.describe("Dashboard navigation", () => {
  // Turbopack first-compile of each dashboard route can briefly exceed the
  // default 30s test timeout when several specs warm up the dev server in
  // parallel. The pages always render eventually — give every nav test 60s
  // and a single retry to absorb that warm-up tax instead of silently
  // failing the release preflight.
  test.describe.configure({ timeout: 60_000, retries: 1 });

  // Prewarm each destination route once before any nav test runs. In
  // Next.js App Router, client-side navigation blocks on the destination
  // RSC payload, which blocks on Turbopack's first-compile of that route.
  // Under `workers: 4` the compile races other specs first-compiling
  // /dashboard/{backy,xray,uploads,...} against the same shared dev
  // server, and the individual per-test 60s ceiling isn't enough to
  // absorb the pile-up. `test.beforeAll` runs once per worker on a
  // dedicated request context (no browser boot), so it stays cheap while
  // making every subsequent click-and-waitForURL hit a warm route.
  // STU-1588 tracks the specific failure mode this prevents.
  test.beforeAll(async () => {
    // Prewarm may compile several dashboard routes on a busy CI runner;
    // give it 3 minutes instead of the case-scoped 60s ceiling.
    test.setTimeout(180_000);
    // Base URL must match `playwright.config.ts` (E2E_PORT = 27006).
    const req = await playwrightRequest.newContext({
      baseURL: "http://localhost:27006",
      storageState: "tests/playwright/.auth/user.json",
    });
    try {
      const routes = [
        "/dashboard/overview",
        "/dashboard/data-management",
        "/dashboard/webhook",
        "/dashboard/uploads",
        "/dashboard/backy",
        "/dashboard/xray",
      ];
      await Promise.all(
        routes.map((r) =>
          req.get(r, { timeout: 120_000, failOnStatusCode: false }).catch(() => undefined),
        ),
      );
    } finally {
      await req.dispose();
    }
  });

  test("sidebar shows branding and nav sections", async ({ page }) => {
    await page.goto("/dashboard");

    // Branding
    await expect(page.locator("text=ZHE.TO")).toBeVisible();

    // Nav section labels (each label is a standalone <span> outside <a> tags)
    const sidebar = page.locator("aside");
    // "概览" appears as both a section label and a nav link — check at least 2
    await expect(sidebar.getByText("概览").first()).toBeVisible();
    await expect(sidebar.getByText("链接管理").first()).toBeVisible();
    await expect(sidebar.getByText("工具").first()).toBeVisible();
    await expect(sidebar.getByText("集成", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("设置", { exact: true })).toBeVisible();

    // Nav items (links)
    await expect(sidebar.locator('a:has-text("全部链接")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("Inbox")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("文件上传")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("Backy")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("Xray")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("数据管理")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("Webhook")')).toBeVisible();
  });

  test("sidebar shows user info", async ({ page }) => {
    await page.goto("/dashboard");

    // User section — the test user from Credentials provider
    await expect(page.locator("text=E2E Test User")).toBeVisible();
    await expect(page.locator("text=e2e@test.local")).toBeVisible();
  });

  test("sidebar shows search button with keyboard shortcut", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.locator("text=搜索链接...")).toBeVisible();
  });

  test("navigate to Overview page", async ({ page }) => {
    await page.goto("/dashboard");

    // Click the 概览 nav link (it's the one inside the nav, not the section label)
    await page.locator('nav a:has-text("概览")').click();
    await page.waitForURL("**/dashboard/overview");

    // Scope to the Breadcrumb nav so we don't match a stale aria-current
    // from a transitional render of another component.
    await expect(page.locator('nav[aria-label="Breadcrumb"] [aria-current="page"]')).toHaveText(
      "概览",
    );
  });

  test("navigate to Data Management page", async ({ page }) => {
    await page.goto("/dashboard");

    await page.locator('a:has-text("数据管理")').click();
    await page.waitForURL("**/dashboard/data-management");

    await expect(page.locator('nav[aria-label="Breadcrumb"] [aria-current="page"]')).toHaveText(
      "数据管理",
    );
  });

  test("navigate to Webhook page", async ({ page }) => {
    await page.goto("/dashboard");

    await page.locator('a:has-text("Webhook")').click();
    await page.waitForURL("**/dashboard/webhook");

    await expect(page.locator('nav[aria-label="Breadcrumb"] [aria-current="page"]')).toHaveText(
      "Webhook",
    );
  });

  test("navigate to Uploads page", async ({ page }) => {
    await page.goto("/dashboard");

    await page.locator('a:has-text("文件上传")').click();
    // /dashboard/uploads pulls the AWS S3 SDK through the SSR getUploads()
    // action. With workers: 4, Turbopack's cold first-compile of that route
    // can push the default `load` wait past 60s even though the URL commit
    // and client hydration happen much sooner. Gate on `commit` — the
    // page-owned assertion below (upload-zone testid + heading) is the real
    // proof the /dashboard/uploads page children rendered, not just the
    // layout-owned Breadcrumb that would light up from `usePathname()`
    // alone even if the child RSC errored.
    await page.waitForURL("**/dashboard/uploads", { waitUntil: "commit" });

    await expect(page.locator('[data-testid="upload-zone"]').first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "文件上传" })).toBeVisible();
    await expect(page.locator('nav[aria-label="Breadcrumb"] [aria-current="page"]')).toHaveText(
      "文件上传",
    );
  });

  test("navigate to Backy page", async ({ page }) => {
    await page.goto("/dashboard");

    await page.locator('a:has-text("Backy")').click();
    await page.waitForURL("**/dashboard/backy");

    await expect(page.locator('nav[aria-label="Breadcrumb"] [aria-current="page"]')).toHaveText(
      "Backy",
    );
  });

  test("navigate to Xray page", async ({ page }) => {
    await page.goto("/dashboard");

    await page.locator('a:has-text("Xray")').click();
    await page.waitForURL("**/dashboard/xray");

    await expect(page.locator('nav[aria-label="Breadcrumb"] [aria-current="page"]')).toHaveText(
      "Xray",
    );
  });

  test("navigate back to Links page", async ({ page }) => {
    await page.goto("/dashboard/data-management");

    await page.locator('a:has-text("全部链接")').click();
    await page.waitForURL(
      (url) => url.pathname === "/dashboard" && !url.searchParams.has("folder"),
    );

    await expect(page.locator('nav[aria-label="Breadcrumb"] [aria-current="page"]')).toHaveText(
      "链接管理",
    );
  });

  test("navigate to Inbox", async ({ page }) => {
    await page.goto("/dashboard");

    await page.locator('a:has-text("Inbox")').click();
    await page.waitForURL("**/dashboard?folder=uncategorized");

    // Should show Inbox content
    await expect(page.locator('nav[aria-label="Breadcrumb"] [aria-current="page"]')).toHaveText(
      "链接管理",
    );
  });

  test("collapse and expand sidebar", async ({ page }) => {
    await page.goto("/dashboard");

    // Sidebar is expanded — ZHE.TO text is visible
    await expect(page.locator("text=ZHE.TO")).toBeVisible();

    // Collapse
    await page.locator('button[aria-label="Collapse sidebar"]').click();

    // In collapsed mode, text nav items are hidden, expand button appears
    await expect(page.locator('button[aria-label="Expand sidebar"]')).toBeVisible();
    // ZHE.TO text should be hidden in collapsed mode
    await expect(page.locator("text=ZHE.TO")).toBeHidden();

    // Expand
    await page.locator('button[aria-label="Expand sidebar"]').click();
    await expect(page.locator("text=ZHE.TO")).toBeVisible();
  });

  test("Cmd+K opens search dialog", async ({ page }) => {
    await page.goto("/dashboard");

    // Press Cmd+K on macOS, Ctrl+K on other platforms
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);

    // Search dialog should appear
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });
});
