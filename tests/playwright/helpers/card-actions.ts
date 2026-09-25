import type { Locator, Page } from "@playwright/test";

export async function cardAction(page: Page, card: Locator, name: string) {
  const button = card.getByRole("button", { name, exact: true });
  if (await button.isVisible()) return button;
  await card.getByRole("button", { name: "更多收藏操作" }).click();
  return page.getByRole("menuitem", { name, exact: true });
}
