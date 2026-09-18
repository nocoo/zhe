import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { executeD1, queryD1, TEST_USER } from "./helpers/d1";
import { waitForLinksPage } from "./helpers/tags";

async function seedCard(page: Page, mode: "grid" | "list") {
  const slug = `e2e-motion-${mode}-${test.info().project.name}-${Date.now()}`;
  await executeD1(
    `INSERT INTO links (user_id, slug, original_url, created_at, meta_title, meta_description, meta_favicon)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      TEST_USER.id,
      slug,
      `https://example.com/${slug}`,
      Date.now(),
      "A place for good links",
      "Keep the things you want to come back to.",
      "/logo-24.png",
    ],
  );
  await page.addInitScript((view) => localStorage.setItem("zhe_links_view_mode", view), mode);
  await page.goto("/dashboard");
  const card = page.getByTestId("link-card").filter({ hasText: slug });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-view", mode);
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await card.evaluate(async (element) => {
    await Promise.all(
      element.parentElement?.getAnimations().map((animation) => animation.finished) ?? [],
    );
  });
  return { card, slug };
}

async function freezeFlight(dialog: Locator, time: number) {
  await expect
    .poll(() =>
      dialog.locator(".link-card-flight").evaluate((element) => element.getAnimations().length),
    )
    .toBeGreaterThan(0);
  await dialog.locator(".link-card-flight").evaluate(async (element, currentTime) => {
    const animation = element.getAnimations().at(-1);
    if (!animation) throw new Error("Expected the card flight to be animated");
    animation.pause();
    await animation.ready;
    animation.currentTime = currentTime;
    await new Promise(requestAnimationFrame);
  }, time);
}

async function resumeFlight(dialog: Locator) {
  await dialog.locator(".link-card-flight").evaluate((element) => {
    element.getAnimations().at(-1)?.play();
  });
}

async function cardBounds(card: Locator) {
  return card.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  });
}

test("grid: fly, flip, save, return, and destroy only after confirming", async ({ page }, info) => {
  const mode = "grid";
  await page.setViewportSize({ width: 1280, height: 900 });
  const { card, slug } = await seedCard(page, mode);
  const origin = await cardBounds(card);
  const trigger = card.getByRole("button", { name: "Edit link", exact: true });
  await trigger.click();
  const dialog = page.getByTestId("card-edit-dialog");

  await freezeFlight(dialog, 0);
  const start = await dialog.locator(".link-card-front").boundingBox();
  expect(start?.x).toBeCloseTo(origin.x, 0);
  expect(start?.y).toBeCloseTo(origin.y, 0);
  expect(start?.width).toBeCloseTo(origin.width, 0);
  expect(start?.height).toBeCloseTo(origin.height, 0);
  expect(await cardBounds(card)).toEqual(origin);
  await expect(card).toBeHidden();
  await freezeFlight(dialog, 150);
  await page.screenshot({ path: info.outputPath(`${mode}-flight.png`) });
  await resumeFlight(dialog);
  await expect(dialog).toHaveAttribute("data-phase", "editing");
  await expect(dialog.locator(".link-card-front")).toBeHidden();
  const center = await dialog.boundingBox();
  expect((center?.x ?? 0) + (center?.width ?? 0) / 2).toBeCloseTo(640, 0);
  expect((center?.y ?? 0) + (center?.height ?? 0) / 2).toBeCloseTo(450, 0);
  await expect(dialog.getByLabel("目标链接", { exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath(`${mode}-editor.png`) });

  const note = `Saved from ${mode}`;
  await dialog.getByLabel("备注", { exact: true }).fill(note);
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toHaveAttribute("data-phase", "returning");
  await freezeFlight(dialog, 459);
  // Even after the write succeeds, the source stays mounted until landing.
  await expect(card).toBeAttached();
  expect(await queryD1<{ note: string }>("SELECT note FROM links WHERE slug = ?", [slug])).toEqual([
    { note },
  ]);
  await resumeFlight(dialog);
  await expect(dialog).toBeHidden();
  await expect(card).toBeVisible();
  expect(await cardBounds(card)).toEqual(origin);
  await expect(card).toContainText(note);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toHaveAttribute("data-phase", "editing");
  await dialog.getByRole("button", { name: "Delete link" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveAttribute("data-phase", "editing");
  await dialog.getByRole("button", { name: "Delete link" }).click();
  await card.evaluate((element) => {
    const animate = element.animate;
    // Pause as destruction starts, before a slower browser can finish and detach the card.
    element.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      animation.pause();
      this.animate = animate;
      return animation;
    };
  });
  await page.getByRole("alertdialog").getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog).toHaveAttribute("data-phase", "returning");
  await expect(card).toBeAttached();
  await expect(dialog).toHaveAttribute("data-phase", "destroying");
  await card.evaluate(async (element) => {
    const animation = element.getAnimations().find((item) => item.playState === "paused");
    if (!animation) throw new Error("Expected a destruction animation");
    await animation.ready;
    animation.currentTime = 220;
  });
  await page.screenshot({ path: info.outputPath(`${mode}-destroy.png`) });
  await card.evaluate((element) =>
    element
      .getAnimations()
      .find((item) => item.playState === "paused")
      ?.play(),
  );
  await expect(card).not.toBeAttached();
  await expect(dialog).not.toBeAttached();
  expect(await queryD1("SELECT id FROM links WHERE slug = ?", [slug])).toEqual([]);
});
test("narrow screen, reduced motion, and failed requests keep the editor usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 667 });
  const { card, slug } = await seedCard(page, "grid");
  await card.getByRole("button", { name: "Edit link", exact: true }).click();
  const dialog = page.getByTestId("card-edit-dialog");
  await expect(dialog).toHaveAttribute("data-phase", "editing");
  await expect(dialog.locator(".link-card-front")).toBeHidden();
  expect(
    await dialog.locator(".link-card-flight").evaluate((element) => element.getAnimations().length),
  ).toBe(0);
  const bounds = await dialog.boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(16);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(359);
  await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeInViewport();

  await page.route("**/dashboard", (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue(),
  );
  await dialog.getByLabel("备注", { exact: true }).fill("Keep this draft after a failed save");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("备注", { exact: true })).toHaveValue(
    "Keep this draft after a failed save",
  );
  await dialog.getByRole("button", { name: "Delete link" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByText("删除失败", { exact: true })).toBeVisible();
  await expect(dialog).toHaveAttribute("data-phase", "editing");
  await expect(dialog.getByRole("button", { name: "Delete link" })).toBeEnabled();
  expect(await queryD1("SELECT id FROM links WHERE slug = ?", [slug])).toHaveLength(1);
  await page.unroute("**/dashboard");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeAttached();
  await expect(card).toBeVisible();
});

test("changing folders waits for the return flight before removing a filtered card", async ({
  page,
}) => {
  const folderId = `e2e-motion-folder-${test.info().project.name}-${Date.now()}`;
  await executeD1("INSERT INTO folders (id, user_id, name, created_at) VALUES (?, ?, ?, ?)", [
    folderId,
    TEST_USER.id,
    "Animation test folder",
    Date.now(),
  ]);
  const { card, slug } = await seedCard(page, "grid");
  await executeD1("UPDATE links SET folder_id = ? WHERE slug = ?", [folderId, slug]);
  await page.goto(`/dashboard?folder=${folderId}`);
  await waitForLinksPage(page);
  await card.getByRole("button", { name: "Edit link", exact: true }).click();
  const dialog = page.getByTestId("card-edit-dialog");
  await expect(dialog).toHaveAttribute("data-phase", "editing");
  await dialog.getByLabel("文件夹", { exact: true }).click();
  await page.getByRole("option", { name: "未分类", exact: true }).click();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toHaveAttribute("data-phase", "returning");
  await freezeFlight(dialog, 250);
  await expect(card).toBeAttached();
  await resumeFlight(dialog);
  await expect(dialog).not.toBeAttached();
  await expect(card).not.toBeAttached();
});

test("early dismissal and resizing a dark editor still return to the card", async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const { card } = await seedCard(page, "grid");
  const trigger = card.getByRole("button", { name: "Edit link", exact: true });
  const dialog = page.getByTestId("card-edit-dialog");
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeAttached();
  await expect(card).toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toHaveAttribute("data-phase", "editing");
  await page.setViewportSize({ width: 640, height: 560 });
  await expect(page.locator('[aria-label="筛选与视图"]')).toBeVisible();
  await page.evaluate(async () => {
    // Capture the new origin after the responsive sidebar has finished moving.
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const origin = await cardBounds(card);
  await page.screenshot({ path: info.outputPath("dark-resized-editor.png") });
  await dialog.getByRole("button", { name: "收起", exact: true }).click();
  await expect(dialog).not.toBeAttached();
  await expect(card).toBeVisible();
  expect(await cardBounds(card)).toEqual(origin);
  await expect(trigger).toBeFocused();
});
