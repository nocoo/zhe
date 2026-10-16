import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { cardAction } from "./helpers/card-actions";
import { executeD1, queryD1, TEST_USER } from "./helpers/d1";

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
  return { card, slug };
}

test("grid: edit and save persists the note", async ({ page }) => {
  const { card, slug } = await seedCard(page, "grid");
  await (await cardAction(page, card, "修改收藏")).click();
  const dialog = page.getByTestId("card-edit-dialog");
  await expect(dialog).toHaveAttribute("data-phase", "editing");
  const note = "Saved from grid e2e";
  await dialog.getByLabel("备注", { exact: true }).fill(note);
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).not.toBeAttached();
  await expect(card).toContainText(note);
  expect(await queryD1<{ note: string }>("SELECT note FROM links WHERE slug = ?", [slug])).toEqual([
    { note },
  ]);
});

test("grid: delete cancel keeps the card and confirm removes it", async ({ page }) => {
  const { card, slug } = await seedCard(page, "grid");
  await (await cardAction(page, card, "删除收藏")).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByRole("heading", { name: "删除收藏？" })).toBeVisible();
  await confirmation.getByRole("button", { name: "取消" }).click();
  await expect(confirmation).not.toBeAttached();
  await expect(card).toBeVisible();
  expect(await queryD1("SELECT id FROM links WHERE slug = ?", [slug])).toHaveLength(1);

  await (await cardAction(page, card, "删除收藏")).click();
  await confirmation.getByRole("button", { name: "删除", exact: true }).click();
  await expect(card).not.toBeAttached();
  expect(await queryD1("SELECT id FROM links WHERE slug = ?", [slug])).toEqual([]);
});

test("failed save keeps the draft in the editor", async ({ page }) => {
  const { card, slug } = await seedCard(page, "grid");
  await page.route("**/dashboard", (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue(),
  );
  await (await cardAction(page, card, "修改收藏")).click();
  const dialog = page.getByTestId("card-edit-dialog");
  await expect(dialog).toHaveAttribute("data-phase", "editing");
  const draft = "Keep this draft after a failed save";
  await dialog.getByLabel("备注", { exact: true }).fill(draft);
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("备注", { exact: true })).toHaveValue(draft);
  await page.unroute("**/dashboard");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeAttached();
  await expect(card).toBeVisible();
  const rows = await queryD1<{ note: string | null }>("SELECT note FROM links WHERE slug = ?", [
    slug,
  ]);
  expect(rows[0]?.note).toBeFalsy();
});
