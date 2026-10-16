import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { test as base, expect } from "./fixtures";
import { cardAction } from "./helpers/card-actions";
import { executeD1, queryD1 } from "./helpers/d1";

const test = base.extend<{ owner: string }>({
  owner: async ({ context, baseURL }, use) => {
    assert(baseURL === `http://localhost:${Number(process.env.ZHE_TEST_APP_PORT ?? 27006)}`);
    const secret = process.env.AUTH_SECRET;
    assert(secret);
    const owner = `card-actions-${randomUUID()}`;
    await executeD1("INSERT INTO users(id,name,email) VALUES(?,?,?)", [
      owner,
      "Card actions test",
      `${owner}@test.local`,
    ]);
    const session = await encode({
      token: { sub: owner, name: "Card actions test", email: `${owner}@test.local` },
      secret,
      salt: "authjs.session-token",
    });
    await context.clearCookies();
    await context.addCookies([{ name: "authjs.session-token", value: session, url: baseURL }]);
    try {
      await use(owner);
    } finally {
      await executeD1("DELETE FROM users WHERE id = ?", [owner]);
    }
  },
});

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

async function seedLink(owner: string, slug: string) {
  await executeD1(
    "INSERT INTO links(user_id,slug,original_url,meta_title,created_at) VALUES(?,?,?,?,?)",
    [owner, slug, `https://example.com/${slug}`, "Saved bookmark", Date.now()],
  );
}

test("grid: management dialogs open and cancel returns to the card list", async ({
  page,
  owner,
}) => {
  const slug = `${owner}-grid`;
  await seedLink(owner, slug);
  await page.addInitScript(() => localStorage.setItem("zhe_links_view_mode", "grid"));
  await page.goto("/dashboard");
  const card = page.getByTestId("link-card").filter({ hasText: slug });
  await expect(card).toBeVisible();

  await (await cardAction(page, card, "访问统计")).click();
  const stats = page.getByRole("dialog", { name: "访问统计" });
  await expect(stats).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(stats).toBeHidden();

  await (await cardAction(page, card, "修改收藏")).click();
  const editor = page.getByTestId("card-edit-dialog");
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("目标链接", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor).not.toBeAttached();

  await (await cardAction(page, card, "删除收藏")).click();
  const deleteDialog = page.getByRole("alertdialog");
  await expect(deleteDialog.getByRole("heading", { name: "删除收藏？" })).toBeVisible();
  await deleteDialog.getByRole("button", { name: "取消" }).click();
  await expect(deleteDialog).not.toBeAttached();
  await expect(page.getByTestId("link-card")).toHaveCount(1);
});

test("list view: confirming delete removes the bookmark", async ({ page, owner }) => {
  const slug = `${owner}-list`;
  await seedLink(owner, slug);
  await page.addInitScript(() => localStorage.setItem("zhe_links_view_mode", "list"));
  await page.goto("/dashboard");
  const card = page.getByTestId("link-card").filter({ hasText: slug });
  await expect(card).toBeVisible();

  await (await cardAction(page, card, "删除收藏")).click();
  const deleteDialog = page.getByRole("alertdialog");
  await deleteDialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(card).not.toBeAttached();
  expect(await queryD1("SELECT id FROM links WHERE slug = ?", [slug])).toEqual([]);
});

test("ideas: delete confirmation cancel keeps the saved card", async ({ page, owner }) => {
  await executeD1(
    "INSERT INTO ideas(user_id,title,content,excerpt,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    [owner, "Saved idea", "Content", "Excerpt", Date.now(), Date.now()],
  );
  await page.goto("/dashboard/ideas");
  const card = page.locator("[data-card-actions-container]").first();
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "更多收藏操作" }).tap();
  await page.getByRole("menuitem", { name: "删除想法" }).tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "取消", exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(card).toBeVisible();
});
