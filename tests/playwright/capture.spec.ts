import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { APP_VERSION } from "../../lib/version";
import { CATALOG_ANCHOR, CATALOG_VERSION } from "../../scripts/fixtures-catalog";

test("reviewable demo catalog in disposable native E2E storage", async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.route("https://favicon.im/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#74918a"/></svg>',
    }),
  );
  await page.clock.setFixedTime(new Date(CATALOG_ANCHOR));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const routes = [
    "overview",
    "",
    "ideas",
    "todos",
    "x",
    "github",
    "tags",
    "uploads",
    "storage",
    "api-keys",
    "webhook",
    "backy",
    "xray",
    "settings/ai",
    "data-management",
  ];
  for (const route of routes) {
    await page.goto(`/dashboard${route ? `/${route}` : ""}`);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator(".animate-pulse:visible, .animate-spin:visible")).toHaveCount(0);
    if (route === "xray") {
      await page
        .getByTestId("xray-tweet-input")
        .fill("https://x.com/alex_fieldnotes/status/1234567890");
      await page.getByRole("button", { name: "获取", exact: true }).click();
      await expect(
        page.getByText("Field notes from a quiet morning", { exact: false }).first(),
      ).toBeVisible();
    }
    if (route === "ideas")
      await expect(page.getByText("A weekly reading ritual", { exact: true })).toBeVisible();
    if (route === "settings/ai")
      await expect(page.getByRole("button", { name: /保存/ })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Application error");
    await expect(async () => {
      const unloaded = await page
        .locator("img")
        .evaluateAll((images) =>
          images
            .filter(
              (image) =>
                image instanceof HTMLImageElement && (!image.complete || image.naturalWidth === 0),
            )
            .map((image) => image.getAttribute("src")),
        );
      expect(unloaded).toEqual([]);
    }).toPass({ timeout: 10_000 });
    await page.screenshot({
      path: info.outputPath(`${route.replaceAll("/", "-") || "links"}.png`),
      animations: "disabled",
    });
  }
  await writeFile(
    info.outputPath("capture.json"),
    JSON.stringify(
      {
        appVersion: APP_VERSION,
        revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        fixtureVersion: CATALOG_VERSION,
        anchor: CATALOG_ANCHOR,
        viewport: { width: 1440, height: 1000 },
        locale: "zh-CN",
        timezone: "Asia/Shanghai",
        routes,
      },
      null,
      2,
    ),
  );
});
