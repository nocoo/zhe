import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { test as base, expect } from "./fixtures";
import { executeD1 } from "./helpers/d1";

const test = base.extend<{ owner: string }>({
  owner: async ({ context, baseURL }, use) => {
    assert(baseURL === "http://localhost:27006");
    const secret = process.env.AUTH_SECRET;
    assert(secret);
    const owner = `reflow-${randomUUID()}`;
    await executeD1("INSERT INTO users(id,name,email) VALUES(?,?,?)", [
      owner,
      "Card motion test",
      `${owner}@test.local`,
    ]);
    const session = await encode({
      token: { sub: owner, name: "Card motion test", email: `${owner}@test.local` },
      secret,
      salt: "authjs.session-token",
    });
    // WebKit keeps host-only and domain cookies separately; replace the setup session.
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

for (const collection of ["grid", "list", "github", "x"] as const) {
  test(`${collection}: responsive card actions`, async ({ page, owner }) => {
    await executeD1(
      "INSERT INTO links(user_id,slug,original_url,meta_title,meta_description,screenshot_url,created_at) VALUES(?,?,?,?,?,?,?)",
      [
        owner,
        "a-very-long-saved-link-slug-for-small-iphone-screens",
        collection === "github"
          ? "https://github.com/example/repository"
          : collection === "x"
            ? "https://x.com/example/status/123456789"
            : "https://example.com",
        "Long card title with 中文内容 ".repeat(5),
        "Long description ".repeat(12),
        "/logo-80.png",
        Date.now(),
      ],
    );
    await page.addInitScript(
      (view) => localStorage.setItem("zhe_links_view_mode", view),
      collection,
    );
    await page.goto(
      `/dashboard${collection === "github" || collection === "x" ? `/${collection}` : ""}`,
    );
    const card = page
      .getByTestId(collection === "github" ? "github-repository" : "link-card")
      .first();
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 932 });
      const actions = card.locator("[data-card-actions]");
      await expect(actions).toHaveAttribute("data-compact", "true");
      const more = actions.getByRole("button", { name: "更多收藏操作" });
      await expect(more).toBeVisible();
      const geometry = await actions.evaluate((el) => {
        const card = el.closest("[data-card-actions-container]")?.getBoundingClientRect();
        if (!card) throw new Error("Missing card container");
        return [...el.querySelectorAll("button")].map((button) => {
          const box = button.getBoundingClientRect();
          return {
            width: box.width,
            height: box.height,
            fits: box.left >= card.left && box.right <= card.right,
          };
        });
      });
      expect(geometry).toHaveLength(2);
      for (const button of geometry) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.fits).toBe(true);
      }
      await more.tap();
      await expect(actions.locator("button[aria-haspopup=menu]")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: "隐藏帖子" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "查看补全记录" })).toBeVisible();
      const box = await menu.boundingBox();
      assert(box);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
      await expect(menu).not.toBeVisible();
      await expect(more).toBeFocused();
      await more.press("ArrowDown");
      await expect(menu.getByRole("menuitem").first()).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(menu.getByRole("menuitem").nth(1)).toBeFocused();
      await page.keyboard.press("Escape");
      await more.tap();
      await page.touchscreen.tap(width - 5, 100);
      await expect(menu).not.toBeVisible();
      await page.screenshot({ path: `.artifacts/card-actions-${collection}-${width}.png` });
    }
    await page.setViewportSize({ width: 1365, height: 1000 });
    if (collection === "list") {
      await expect(card.locator("[data-card-actions]")).toHaveAttribute("data-compact", "false");
      await expect(card.getByRole("button", { name: "隐藏帖子" })).toBeVisible();
      await expect(card.getByRole("button", { name: "更多收藏操作" })).toHaveCount(0);
    }
  });
}

for (const collection of ["ideas", "uploads"] as const) {
  test(`${collection}: touch menus and dialogs return focus`, async ({ page, owner }) => {
    const title = "Long saved content 中文 ".repeat(8);
    const now = Date.now();
    if (collection === "ideas") {
      await executeD1(
        "INSERT INTO ideas(user_id,title,content,excerpt,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        [owner, title, "A saved idea", "A long excerpt ".repeat(20), now, now],
      );
    } else {
      await executeD1(
        "INSERT INTO uploads(user_id,key,file_name,file_type,file_size,public_url,created_at) VALUES(?,?,?,?,?,?,?)",
        [owner, `${owner}/video.mp4`, title, "video/mp4", 1024, "/test-video.mp4", now],
      );
    }
    await page.goto(`/dashboard/${collection}`);
    const card = page.locator("[data-card-actions-container]").first();
    await expect(card).toBeVisible();
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 932 });
      const more = card.getByRole("button", { name: "更多收藏操作" });
      await more.tap();
      const menu = page.getByRole("menu");
      const remove = menu.getByRole("menuitem", {
        name: collection === "ideas" ? "删除想法" : "Delete file",
      });
      await expect(remove).toBeVisible();
      expect((await remove.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await remove.tap();
      const dialog = page.getByRole(collection === "ideas" ? "dialog" : "alertdialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "取消", exact: true }).tap();
      await expect(dialog).not.toBeVisible();
      await expect(more).toBeFocused();
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: `.artifacts/card-actions-${collection}-${width}.png` });
    }
    if (collection === "ideas") {
      await page.getByRole("button", { name: "List view" }).click();
      await card.getByRole("button", { name: "更多收藏操作" }).tap();
      await expect(page.getByRole("menuitem", { name: "删除想法" })).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await card.getByRole("button", { name: "预览视频" }).tap();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(card.getByRole("button", { name: "预览视频" })).toBeFocused();
    }
  });
}

test.describe("desktop", () => {
  test.use({ isMobile: false, hasTouch: false, viewport: { width: 1365, height: 1000 } });
  test("wide lists retain direct secondary actions", async ({ page, owner }) => {
    await executeD1(
      "INSERT INTO links(user_id,slug,original_url,meta_title,created_at) VALUES(?,?,?,?,?)",
      [owner, owner, "https://example.com", "Desktop saved link", Date.now()],
    );
    await page.addInitScript(() => localStorage.setItem("zhe_links_view_mode", "list"));
    await page.goto("/dashboard");
    const card = page.getByTestId("link-card").first();
    await expect(card.locator("[data-card-actions]")).toHaveAttribute("data-compact", "false");
    const edit = card.getByRole("button", { name: "Edit link", exact: true });
    expect((await edit.boundingBox())?.height).toBeCloseTo(32, 1);
    await expect(card.getByRole("button", { name: "隐藏帖子", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Refresh metadata", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "更多收藏操作" })).toHaveCount(0);
    await edit.click();
    await expect(page.getByTestId("card-edit-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(edit).toBeFocused();
  });
});
