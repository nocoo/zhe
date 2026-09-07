import type { Page } from "@playwright/test";

/** Current page name in AppHeader (h1, text-sm). Header lives inside <main>. */
export function appTitle(page: Page, name: string | RegExp) {
  return page.locator("main > header").getByRole("heading", { name, exact: true });
}

/** Content heading inside the island (PageHeader h1). */
export function islandHeading(page: Page, name: string | RegExp) {
  return page.locator("[data-basalt-surface-root]").getByRole("heading", { name, exact: true });
}
