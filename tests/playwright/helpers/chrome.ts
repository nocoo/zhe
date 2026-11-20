import type { Page } from "@playwright/test";

export function appTitle(page: Page, name: string | RegExp) {
  return page
    .getByRole("navigation", { name: "面包屑导航" })
    .locator('[aria-current="page"]')
    .and(page.getByText(name, { exact: true }));
}

/** Content heading inside the island (PageHeader h1). */
export function islandHeading(page: Page, name: string | RegExp) {
  return page.locator("[data-basalt-surface-root]").getByRole("heading", { name, exact: true });
}
