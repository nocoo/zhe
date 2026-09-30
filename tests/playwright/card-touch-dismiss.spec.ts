import { expect, test } from "./fixtures/owner";
import { executeD1 } from "./helpers/d1";

test.use({ viewport: { width: 375, height: 932 }, isMobile: true, hasTouch: true });

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });
    test("outside touch completes before menu dismissal and focus return", async ({
      page,
      owner,
    }) => {
      await executeD1(
        "INSERT INTO links(user_id,slug,original_url,meta_title,created_at) VALUES(?,?,?,?,?)",
        [owner, owner, "https://example.com", "Touch lifecycle", Date.now()],
      );
      await page.addInitScript(() => localStorage.setItem("zhe_links_view_mode", "grid"));
      await page.goto("/dashboard");
      const more = page.getByTestId("link-card").getByRole("button", { name: "更多收藏操作" });
      const menu = page.getByRole("menu");
      await more.tap();
      await expect(menu).toBeVisible();
      const session = await page.context().newCDPSession(page);
      let touching = false;
      try {
        touching = true;
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: 370, y: 100 }],
        });
        await expect(menu).toBeVisible();
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        touching = false;
        await expect(menu).toBeHidden();
        await expect(more).toBeFocused();

        await more.tap();
        await expect(menu).toBeVisible();
        touching = true;
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: 370, y: 100 }],
        });
        await expect(menu).toBeVisible();
        await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
        touching = false;
        await expect(menu).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(more).toBeFocused();
      } finally {
        if (touching)
          await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
        await session.detach();
      }
    });
  });
}
