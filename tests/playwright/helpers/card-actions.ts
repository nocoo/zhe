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

export async function expectMobileCardActions(card: Locator) {
  const actions = card.locator("[data-card-actions]");
  await expect(actions).toHaveAttribute("data-compact", "true");
  const more = actions.getByRole("button", { name: "更多收藏操作" });
  await expect(more).toBeVisible();
  const geometry = await actions.evaluate((element) => {
    const container = element.closest("[data-card-actions-container]")?.getBoundingClientRect();
    if (!container) throw new Error("Missing card container");
    return [...element.querySelectorAll("button")].map((button) => {
      const box = button.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        fits: box.left >= container.left && box.right <= container.right,
      };
    });
  });
  expect(geometry).toHaveLength(2);
  for (const button of geometry) {
    expect(Number(button.width.toFixed(3))).toBeGreaterThanOrEqual(44);
    expect(Number(button.height.toFixed(3))).toBeGreaterThanOrEqual(44);
    expect(button.fits).toBe(true);
  }
  return { actions, more };
}
