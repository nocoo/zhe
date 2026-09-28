import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const origin = "https://zhe.dev.hexly.ai";
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
if (process.env.ZHE_INITIAL_PREFERENCE) {
  await context.addInitScript((mode) => {
    if (!sessionStorage.getItem("zhe:verification-initialized")) {
      localStorage.setItem("zhe:environment-mode", mode);
      sessionStorage.setItem("zhe:verification-initialized", "1");
    }
  }, process.env.ZHE_INITIAL_PREFERENCE);
}
const page = await context.newPage();
async function ready(mode: string) {
  await expect(page.getByRole("radio", { name: mode, exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 120_000 },
  );
}
async function login() {
  await page.getByRole("button", { name: "Continue with fixture account" }).click();
  await page.waitForURL(/dashboard/);
}
try {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const expected = process.env.ZHE_EXPECT_INITIAL === "e2e" ? "E2E" : "Demo";
  await ready(expected);
  await expect(page.getByRole("radio", { name: "Prod", exact: true })).toBeEnabled();
  if (expected === "E2E") {
    const initial = await page.evaluate(() => window.__ZHE_LOCAL__?.id);
    assert(initial);
    await page.getByRole("radio", { name: "Demo", exact: true }).click();
    await ready("Demo");
    await assert.rejects(access(`.test-storage/runs/${initial}`));
  }
  await mkdir(".artifacts/local-verification", { recursive: true });
  await page.screenshot({ path: ".artifacts/local-verification/login.png" });
  await login();
  const oldTab = await context.newPage();
  await oldTab.goto(`${origin}/dashboard`);
  await oldTab.getByRole("radio", { name: "Demo", exact: true }).waitFor();
  await page.getByRole("radio", { name: "E2E", exact: true }).click();
  await page.waitForURL(`${origin}/`, { timeout: 120_000 });
  await ready("E2E");
  assert.equal(await oldTab.evaluate(async () => (await fetch("/api/health")).status), 410);
  const first = await page.evaluate(() => window.__ZHE_LOCAL__?.id);
  assert(first);
  await login();
  await page.goto(`${origin}/dashboard/uploads`);
  await page
    .getByTestId("upload-input")
    .first()
    .setInputFiles({
      name: "manual-environment-verification.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Owned manual E2E upload through the local gateway."),
    });
  await expect(
    page.getByTestId("upload-file-name").filter({ hasText: "manual-environment-verification.txt" }),
  ).toBeVisible({ timeout: 30_000 });
  await page.goto(`${origin}/dashboard/ideas/1001`);
  const textarea = page.locator("textarea").first();
  await textarea.fill("A draft that must survive cancelling environment exit.");
  page.once("dialog", async (dialog) => dialog.dismiss());
  await page.getByRole("radio", { name: "Demo", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__ZHE_LOCAL__?.id), first);
  assert.equal(
    await textarea.inputValue(),
    "A draft that must survive cancelling environment exit.",
  );
  assert.equal(await page.evaluate(() => localStorage.getItem("zhe:environment-mode")), "e2e");
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("radio", { name: "Demo", exact: true }).click();
  await page.waitForURL(`${origin}/`, { timeout: 120_000 });
  await ready("Demo");
  await assert.rejects(access(`.test-storage/runs/${first}`));
  await page.getByRole("radio", { name: "E2E", exact: true }).click();
  await page.waitForFunction(
    (id) => window.__ZHE_LOCAL__?.mode === "e2e" && window.__ZHE_LOCAL__.id !== id,
    first,
    { timeout: 120_000 },
  );
  const second = await page.evaluate(() => window.__ZHE_LOCAL__?.id);
  assert(second && second !== first);
  await page.getByRole("radio", { name: "Demo", exact: true }).click();
  await ready("Demo");
  await assert.rejects(access(`.test-storage/runs/${second}`));
  await login();
  await page.goto(`${origin}/dashboard/x`);
  await expect(page.locator(".animate-pulse:visible, .animate-spin:visible")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".artifacts/local-verification/x-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".artifacts/local-verification/x-mobile.png",
    animations: "disabled",
  });
  console.log(
    "Passed: manual E2E entry, cancelled draft discard, owned cleanup, fresh reentry and stale request rejection.",
  );
} finally {
  await browser.close();
}
