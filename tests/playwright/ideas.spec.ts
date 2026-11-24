import { expect, test } from "./fixtures";
import { cardAction } from "./helpers/card-actions";
import { islandHeading } from "./helpers/chrome";
import { executeD1, TEST_USER } from "./helpers/d1";

async function waitForIdeasPage(page: import("@playwright/test").Page): Promise<void> {
  await islandHeading(page, "想法").waitFor({ timeout: 30_000 });
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 30_000 });
}

function ideaCard(page: import("@playwright/test").Page, content: string) {
  return page.locator("div.group").filter({ hasText: content }).first();
}

async function openIdeaByContent(
  page: import("@playwright/test").Page,
  content: string,
): Promise<void> {
  const card = ideaCard(page, content);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.getByRole("button", { name: /打开想法/ }).click();
}

async function hoverIdeaCard(
  page: import("@playwright/test").Page,
  content: string,
): Promise<void> {
  const card = ideaCard(page, content);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.getByRole("button", { name: /打开想法/ }).hover();
}

test.describe("Ideas", () => {
  test.beforeAll(async () => {
    await executeD1(
      "DELETE FROM idea_tags WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ?)",
      [TEST_USER.id],
    );
    await executeD1("DELETE FROM ideas WHERE user_id = ?", [TEST_USER.id]);
  });

  test.afterAll(async () => {
    await executeD1(
      "DELETE FROM idea_tags WHERE idea_id IN (SELECT id FROM ideas WHERE user_id = ?)",
      [TEST_USER.id],
    );
    await executeD1("DELETE FROM ideas WHERE user_id = ?", [TEST_USER.id]);
  });

  test("creates idea and opens editor", async ({ page }) => {
    const content = `Test idea content ${Date.now()}`;
    await page.goto("/dashboard/ideas");
    await waitForIdeasPage(page);

    await page.getByRole("button", { name: "新想法", exact: true }).click();
    await page.locator("#new-content").fill(content);
    await page.getByRole("dialog").getByRole("button", { name: "创建" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(content)).toBeVisible({ timeout: 10_000 });

    await openIdeaByContent(page, content);
    await expect(page).toHaveURL(/\/dashboard\/ideas\/\d+/, { timeout: 15_000 });
    await expect(page.getByText("编辑", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("textarea")).toHaveValue(content, { timeout: 15_000 });
  });

  test("deletes idea when confirmed", async ({ page }) => {
    const content = `Idea to delete ${Date.now()}`;
    await page.goto("/dashboard/ideas");
    await waitForIdeasPage(page);

    await page.getByRole("button", { name: "新想法", exact: true }).click();
    await page.locator("#new-content").fill(content);
    await page.getByRole("dialog").getByRole("button", { name: "创建" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(content)).toBeVisible();

    await hoverIdeaCard(page, content);
    await (await cardAction(page, ideaCard(page, content), "删除想法")).click();
    await page.getByRole("dialog").getByRole("button", { name: "删除" }).click();
    await expect(page.getByText(content)).toBeHidden({ timeout: 10_000 });
  });
});
