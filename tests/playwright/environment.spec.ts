import { expect, test } from "@playwright/test";

test("automation keeps its server target despite stored preferences and forged switching", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("zhe:environment-mode", "prod"));
  await page.goto("/dashboard");
  if (process.env.CI)
    await expect(page.getByRole("radio", { name: "E2E", exact: true })).toHaveCount(0);
  else {
    await expect(page.getByRole("radio", { name: "E2E", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByRole("radio", { name: "Demo", exact: true })).toBeDisabled();
    await expect(page.getByRole("radio", { name: "Prod", exact: true })).toBeDisabled();
  }
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/_local/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "prod" }),
        })
      ).status,
  );
  expect(status).toBeGreaterThanOrEqual(400);
  expect(await page.evaluate(() => localStorage.getItem("zhe:environment-mode"))).toBe("prod");
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
});
