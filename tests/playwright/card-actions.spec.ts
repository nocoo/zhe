import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { test as base, expect } from "./fixtures";
import { executeD1, queryD1 } from "./helpers/d1";

const test = base.extend<{ owner: string }>({
  owner: async ({ context, baseURL }, use) => {
    assert(baseURL === `http://localhost:${Number(process.env.ZHE_TEST_APP_PORT ?? 27006)}`);
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
  test.describe(collection, () => {
    test.beforeEach(async ({ page, owner }) => {
      const now = Date.now();
      await page.clock.setFixedTime(now);
      for (const index of [0, 1, 2])
        await executeD1(
          "INSERT INTO links(user_id,slug,original_url,meta_title,meta_description,screenshot_url,created_at) VALUES(?,?,?,?,?,?,?)",
          [
            owner,
            `${owner}-${index}`,
            collection === "github"
              ? `https://github.com/example/repository-${index}`
              : collection === "x"
                ? `https://x.com/example/status/12345678${index}`
                : `https://example.com/${index}`,
            index ? "Short title" : "Long card title with 中文内容 ".repeat(8),
            index ? "Short description" : "Long description ".repeat(40),
            "/logo-80.png",
            now - (index === 2 ? 59 * 60_000 : (index === 1 ? 22 : 3) * 86400_000),
          ],
        );
      const [first] = await queryD1<{ id: number }>(
        "SELECT id FROM links WHERE user_id=? ORDER BY id LIMIT 1",
        [owner],
      );
      assert(first);
      for (const index of [0, 1, 2]) {
        const tagId = `${owner}-tag-${index}`;
        await executeD1("INSERT INTO tags(id,user_id,name,color,created_at) VALUES(?,?,?,?,?)", [
          tagId,
          owner,
          `${index}: Long saved tag 中文内容`,
          "blue",
          Date.now(),
        ]);
        await executeD1("INSERT INTO link_tags(link_id,tag_id) VALUES(?,?)", [first.id, tagId]);
      }
      await page.addInitScript(
        (view) => localStorage.setItem("zhe_links_view_mode", view),
        collection,
      );
      await page.goto(
        `/dashboard${collection === "github" || collection === "x" ? `/${collection}` : ""}`,
      );
    });
    for (const width of [320, 375, 430, 1365]) {
      test(`${width}px: fixed actions and collection layout`, async ({ page }, info) => {
        const cards = page.getByTestId(collection === "github" ? "github-repository" : "link-card");
        const card = cards.first();
        const tagged = cards.filter({ has: page.getByRole("list", { name: "收藏标签" }) });
        await expect(cards).toHaveCount(3);
        await page.setViewportSize({ width, height: 932 });
        await card.scrollIntoViewIfNeeded();
        const actions = card.locator("[data-bookmark-actions]");
        await expect(actions.getByRole("button")).toHaveCount(
          collection === "github" || collection === "x" ? 4 : 3,
        );
        await expect(card.getByRole("button", { name: "复制收藏时间" })).toHaveText("59分钟前");
        if (collection === "github" || collection === "x") {
          await expect(actions.getByRole("button").first()).toHaveAccessibleName(
            collection === "github" ? "阅读 README" : "查看 X 全文",
          );
        }
        await expect(actions.getByRole("button", { name: "AI 整理" })).toBeVisible();
        const more = actions.getByRole("button", { name: "更多收藏操作" });
        const geometry = await actions.evaluate((el) => {
          const card = el.closest("[data-card-actions-container]")?.getBoundingClientRect();
          if (!card) throw new Error("Missing card");
          return [...el.querySelectorAll("button")].map((button) => {
            const box = button.getBoundingClientRect();
            return {
              width: box.width,
              height: box.height,
              fits: box.left >= card.left && box.right <= card.right,
            };
          });
        });
        for (const button of geometry) {
          expect(button.width).toBeGreaterThanOrEqual(44);
          expect(button.height).toBeGreaterThanOrEqual(44);
          expect(button.fits).toBe(true);
        }
        const heights = await cards.evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().height),
        );
        if (collection !== "x") expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
        expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        const row = card.locator("[data-bookmark-action-row]");
        expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        const date = card.getByRole("button", { name: "复制收藏时间" });
        const dateSpacing = await date.evaluate((element) => {
          const style = getComputedStyle(element);
          const time = element.querySelector("time")?.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          if (!time) throw new Error("Missing saved time");
          return {
            left: time.left - box.left,
            right: box.right - time.right,
            padding: Number.parseFloat(style.paddingInlineStart),
          };
        });
        expect(dateSpacing.padding).toBeGreaterThanOrEqual(8);
        expect(dateSpacing.left).toBeGreaterThanOrEqual(8);
        expect(dateSpacing.right).toBeGreaterThanOrEqual(8);
        if (collection === "x") {
          await expect(cards.locator("[data-bookmark-classification]")).toHaveCount(0);
          await expect(cards.getByRole("list", { name: "收藏标签" })).toHaveCount(0);
        } else {
          const tags = tagged.getByRole("list", { name: "收藏标签" });
          await expect(tags.getByRole("listitem")).toHaveCount(3);
          await expect(tags.getByRole("button")).toHaveCount(0);
          const strip = await tags.evaluate((element) => {
            const folder = element.previousElementSibling?.getBoundingClientRect();
            const rect = element.getBoundingClientRect();
            return {
              left: rect.left,
              folderRight: folder?.right,
              scrollable: element.scrollWidth > element.clientWidth,
            };
          });
          assert(strip.folderRight);
          expect(strip.left).toBeGreaterThan(strip.folderRight);
          if (width < 500) {
            expect(strip.scrollable).toBe(true);
            await tags.evaluate((element) => {
              element.scrollLeft = 0;
            });
            await tags.focus();
            await page.keyboard.press("ArrowRight");
            await expect
              .poll(() => tags.evaluate((element) => element.scrollLeft))
              .toBeGreaterThan(0);
            await page.keyboard.press("ArrowLeft");
            await expect.poll(() => tags.evaluate((element) => element.scrollLeft)).toBe(0);
          }
        }
        await more.click();
        const menu = page.getByRole("menu");
        await expect(menu.getByRole("menuitem")).toHaveText([
          "修改收藏",
          "数据采集",
          "访问统计",
          "隐藏帖子",
          "删除收藏",
        ]);
        const box = await menu.boundingBox();
        assert(box);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        await page.keyboard.press("Escape");
        await expect(more).toBeFocused();
        await more.press("ArrowDown");
        await expect(menu.getByRole("menuitem").first()).toBeFocused();
        await page.keyboard.press("Escape");
        await actions.getByRole("button", { name: "复制链接" }).click();
        await expect(page.getByRole("menuitem")).toHaveText(["复制原链接", "复制短链接"]);
        await page.keyboard.press("Escape");
        await page.screenshot({ path: info.outputPath(`${collection}-${width}.png`) });
      });
    }
    test("management dialogs preserve focus and form geometry", async ({ page }) => {
      await page.setViewportSize({ width: 1365, height: 932 });
      const cards = page.getByTestId(collection === "github" ? "github-repository" : "link-card");
      const card = cards.first();
      await expect(cards).toHaveCount(3);
      const more = card.getByRole("button", { name: "更多收藏操作" });
      await more.click();
      await page.getByRole("menuitem", { name: "访问统计" }).click();
      await expect(page.getByRole("dialog", { name: "访问统计" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(more).toBeFocused();
      await more.click();
      await page.getByRole("menuitem", { name: "修改收藏" }).click();
      await expect(page.getByRole("menu")).toBeHidden();
      const editor = page.getByTestId("card-edit-dialog");
      await expect(editor).toBeVisible();
      await expect
        .poll(async () => editor.getAttribute("data-phase"), { timeout: 15_000 })
        .toBe("editing");
      await editor.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished));
      });
      expect(await editor.evaluate((element) => getComputedStyle(element).padding)).toBe("0px");
      const input = editor.getByLabel("目标链接", { exact: true });
      expect(await input.evaluate((element) => element.getBoundingClientRect().height)).toBeCloseTo(
        34,
        1,
      );
      await expect(editor.getByRole("button", { name: "Delete link" })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(editor).not.toBeAttached();
      await expect(more).toBeFocused();
      await more.click();
      await page.getByRole("menuitem", { name: "删除收藏" }).click();
      const deleteDialog = page.getByRole("alertdialog");
      await expect(deleteDialog).toBeVisible();
      await deleteDialog.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished));
      });
      const cancelDelete = deleteDialog.getByRole("button", { name: "取消" });
      await cancelDelete.click();
      await expect(cards).toHaveCount(3);
      await expect(more).toBeFocused();
    });
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
      await menu.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished));
      });
      expect(Number((await remove.boundingBox())?.height.toFixed(3))).toBeGreaterThanOrEqual(44);
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
  test("last-row actions remain clickable above the floating create button", async ({
    page,
    owner,
  }) => {
    for (let index = 0; index < 6; index++)
      await executeD1(
        "INSERT INTO links(user_id,slug,original_url,meta_title,created_at) VALUES(?,?,?,?,?)",
        [
          owner,
          `${owner}-${index}`,
          `https://github.com/example/repository-${index}`,
          `Repository ${index}`,
          Date.now(),
        ],
      );
    await page.goto("/dashboard/github");
    const cards = page.getByTestId("github-repository");
    await expect(cards).toHaveCount(6);
    const last = cards.last();
    await last.evaluate((element) => {
      let scroller = element.parentElement;
      while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
        scroller = scroller.parentElement;
      if (!scroller) throw new Error("Missing collection scroller");
      scroller.scrollTop = scroller.scrollHeight;
    });
    const more = last.getByRole("button", { name: "更多收藏操作" });
    await expect
      .poll(() =>
        more.evaluate((button) => {
          const box = button.getBoundingClientRect();
          const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return target !== null && button.contains(target);
        }),
      )
      .toBe(true);
    await more.click();
    await expect(page.getByRole("menuitem", { name: "修改收藏" })).toBeVisible();
  });
  test("wide lists keep secondary actions in more", async ({ page, owner }) => {
    await executeD1(
      "INSERT INTO links(user_id,slug,original_url,meta_title,created_at) VALUES(?,?,?,?,?)",
      [owner, owner, "https://example.com", "Desktop saved link", Date.now()],
    );
    await page.addInitScript(() => localStorage.setItem("zhe_links_view_mode", "list"));
    await page.goto("/dashboard");
    const card = page.getByTestId("link-card").first();
    const more = card.getByRole("button", { name: "更多收藏操作" });
    expect((await more.boundingBox())?.height).toBeCloseTo(32, 1);
    await expect(card.getByRole("button", { name: "隐藏帖子", exact: true })).toHaveCount(0);
    await more.click();
    await page.getByRole("menuitem", { name: "修改收藏" }).click();
    await expect(page.getByTestId("card-edit-dialog")).toHaveAttribute("data-phase", "editing");
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();
  });
});

test("selection keeps a tall card stationary and Escape exits without scrolling", async ({
  page,
  owner,
}) => {
  await executeD1(
    "INSERT INTO links(user_id,slug,original_url,meta_title,created_at) VALUES(?,?,?,?,?)",
    [owner, owner, "https://example.com", "Tall selection card", Date.now()],
  );
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "多选卡片" }).click();
  const choice = page.getByRole("checkbox", { name: "选择 Tall selection card" });
  await expect(choice).toBeVisible();
  const overlay = page.locator("label").filter({ has: choice });
  const point = await overlay.evaluate(async (el) => {
    const wrapper = el.parentElement;
    if (!wrapper) throw new Error("Missing selection wrapper");
    await Promise.all(wrapper.getAnimations().map((animation) => animation.finished));
    wrapper.style.minHeight = "1400px";
    let scroller = wrapper.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
      scroller = scroller.parentElement;
    if (!scroller) throw new Error("Missing page scroller");
    scroller.scrollTop = 450;
    const box = el.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: 350 };
  });
  const positions = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll("*"))
        .filter((el) => el.scrollTop > 0)
        .map((el) => el.scrollTop),
    );
  const before = await positions();
  expect(before.length).toBeGreaterThan(0);
  await page.touchscreen.tap(point.x, point.y);
  await expect(choice).toBeChecked();
  expect(await positions()).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(choice).toHaveCount(0);
  expect(await positions()).toEqual(before);
  await expect(page.getByRole("button", { name: "多选卡片" })).toBeFocused();
});
