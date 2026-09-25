import { expect, type Locator, type Page } from "@playwright/test";

export async function cardAction(page: Page, card: Locator, name: string) {
  await expect
    .poll(() =>
      card.locator("[data-card-actions]").evaluate((actions) => {
        const container = actions.closest<HTMLElement>("[data-card-actions-container]");
        if (!container) return false;
        const style = getComputedStyle(container);
        const width =
          container.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight);
        return actions.getAttribute("data-compact") === String(width < 480);
      }),
    )
    .toBe(true);
  const button = card.getByRole("button", { name, exact: true });
  if (await button.isVisible()) return button;
  await card.getByRole("button", { name: "更多收藏操作" }).click();
  return page.getByRole("menuitem", { name, exact: true });
}
