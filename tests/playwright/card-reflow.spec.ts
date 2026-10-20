import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import type { Locator, Page } from "@playwright/test";
import { uploadBufferToR2 } from "../../lib/r2/local-binding";
import { test as base, expect } from "./fixtures";
import { cardAction } from "./helpers/card-actions";
import { executeD1, queryD1 } from "./helpers/d1";

const test = base.extend<{ owner: string }>({
  owner: async ({ context, baseURL }, use) => {
    assert(baseURL === `http://localhost:${Number(process.env.ZHE_TEST_APP_PORT ?? 27006)}`);
    const secret = process.env.AUTH_SECRET;
    assert(secret);
    const owner = `reflow-${randomUUID()}`;
    await executeD1("INSERT INTO users(id,name,email) VALUES(?,?,?)", [
      owner,
      "Card reflow test",
      `${owner}@test.local`,
    ]);
    const session = await encode({
      token: { sub: owner, name: "Card reflow test", email: `${owner}@test.local` },
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

type Collection = "grid" | "list" | "github" | "x";

async function seedCollection(page: Page, owner: string, collection: Collection, count = 8) {
  const now = Date.now();
  for (let index = 0; index < count; index++) {
    const url =
      collection === "github"
        ? `https://github.com/motion/repository-${index}`
        : collection === "x"
          ? `https://x.com/motion/status/${now}${index}`
          : `https://example.com/reading-${index}`;
    await executeD1(
      `INSERT INTO links(user_id,slug,original_url,meta_title,meta_description,meta_favicon,screenshot_url,created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      [
        owner,
        `${owner}-${index}`,
        url,
        `Saved link ${index + 1}`,
        "A useful reference.",
        "/logo-24.png",
        "/logo-80.png",
        now - index * 1000,
      ],
    );
  }
  await page.addInitScript((view) => localStorage.setItem("zhe_links_view_mode", view), collection);
  const path = collection === "grid" || collection === "list" ? "" : `/${collection}`;
  await page.goto(`/dashboard${path}`);
  const cards = page.getByTestId(collection === "github" ? "github-repository" : "link-card");
  await expect(cards).toHaveCount(count);
  return cards;
}

async function confirmDelete(page: Page, card: Locator) {
  await (await cardAction(page, card, "删除收藏")).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除", exact: true }).click();
}

test("grid: deleting a card removes it from the list", async ({ page, owner }) => {
  const cards = await seedCollection(page, owner, "grid");
  const card = cards.first();
  await confirmDelete(page, card);
  await expect(cards).toHaveCount(7);
  expect(await queryD1("SELECT id FROM links WHERE user_id = ?", [owner])).toHaveLength(7);
});

test("grid: bulk selection deletes the chosen bookmarks", async ({ page, owner }) => {
  await seedCollection(page, owner, "grid");
  await page.getByRole("button", { name: "多选卡片" }).click();
  const choices = page.getByRole("checkbox", { name: /^选择 / });
  await expect(choices).toHaveCount(8);
  await choices.first().check();
  await choices.nth(1).check();
  await page
    .getByRole("group", { name: "多选操作", exact: true })
    .getByRole("button", { name: "删除所选" })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { name: "删除 2 项内容？" })).toBeVisible();
  await dialog.getByRole("button", { name: "确认删除" }).click();
  await expect(dialog.getByRole("status")).toContainText("已删除 2 项");
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("link-card")).toHaveCount(6);
  expect(await queryD1("SELECT id FROM links WHERE user_id=?", [owner])).toHaveLength(6);
});

test("grid: hide and reveal hidden bookmarks", async ({ page, owner }) => {
  const cards = await seedCollection(page, owner, "grid");
  const card = cards.first();
  const toggle = page.getByRole("button", { name: "展示隐藏", exact: true });
  await (await cardAction(page, card, "隐藏帖子")).click();
  await expect(cards).toHaveCount(7);
  await toggle.click();
  await expect(cards).toHaveCount(8);
  await (await cardAction(page, card, "取消隐藏")).click();
  await expect(page.getByText("已取消隐藏", { exact: true })).toBeVisible();
});

test("uploads: bulk deletion removes files from storage", async ({ page, owner }) => {
  assert(process.env.LOCAL_R2 === "1");
  const assets: string[] = [];
  for (let index = 0; index < 3; index++) {
    const key = `fixture/${owner}/file-${index}.txt`;
    const url = `${process.env.R2_PUBLIC_DOMAIN}/${key}`;
    await uploadBufferToR2(key, Buffer.from("saved file"), "text/plain");
    assets.push(url);
    await executeD1(
      "INSERT INTO uploads(user_id,key,file_name,file_type,file_size,public_url,created_at) VALUES(?,?,?,'text/plain',10,?,?)",
      [owner, key, `File ${index}`, url, Date.now()],
    );
  }
  await page.goto("/dashboard/uploads");
  await page.getByRole("button", { name: "多选卡片" }).click();
  const toolbar = page.getByRole("group", { name: "多选操作", exact: true });
  await toolbar.getByRole("button", { name: "全选当前列表" }).click();
  await toolbar.getByRole("button", { name: "删除所选" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "确认删除" }).click();
  await expect(dialog.getByRole("status")).toContainText("已删除 3 项");
  await expect(page.getByRole("button", { name: "多选卡片" })).toBeDisabled();
  expect(await queryD1("SELECT id FROM uploads WHERE user_id=?", [owner])).toEqual([]);
  for (const url of assets) expect((await fetch(url)).status).toBe(404);
});
