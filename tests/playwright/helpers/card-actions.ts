import { expect, type Locator, type Page } from "@playwright/test";

export async function cardAction(page: Page, card: Locator, name: string) {
  await expect(card).toBeVisible();
  await card.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }),
  );
  const adaptive = card.locator("[data-card-actions]");
  if (await adaptive.count())
    await expect
      .poll(() =>
        adaptive.evaluate((actions) => {
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
  const moreButton = card.getByRole("button", { name: "更多收藏操作" });
  await moreButton.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }),
  );
  await expect(moreButton).toBeVisible();
  await moreButton.click({ timeout: 15_000 });
  const item = page.getByRole("menuitem", { name, exact: true });
  await expect(item).toBeVisible();
  return item;
}
