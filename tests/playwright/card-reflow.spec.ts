import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import type { Locator, Page } from "@playwright/test";
import { test as base, expect } from "./fixtures";
import { executeD1, queryD1 } from "./helpers/d1";

const test = base.extend<{ owner: string }>({
  owner: async ({ context, baseURL }, use) => {
    assert(baseURL === "http://localhost:27006");
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

type Collection = "grid" | "list" | "github" | "x" | "inbox";

async function seedCollection(page: Page, owner: string, collection: Collection) {
  const now = Date.now();
  for (let index = 0; index < 8; index++) {
    const url =
      collection === "github"
        ? `https://github.com/motion/repository-${index}`
        : collection === "x"
          ? `https://x.com/motion/status/${now}${index}`
          : `https://example.com/reading-${index}`;
    await executeD1(
      `INSERT INTO links(user_id,slug,original_url,meta_title,meta_description,meta_favicon,screenshot_url,created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      [
        owner,
        `${owner}-${index}`,
        url,
        `Saved link ${index + 1}`,
        "A useful reference.",
        "/logo-24.png",
        "/logo-80.png",
        now - index * 1000,
      ],
    );
  }
  await page.addInitScript((view) => localStorage.setItem("zhe_links_view_mode", view), collection);
  const path =
    collection === "inbox"
      ? "?folder=uncategorized"
      : collection === "grid" || collection === "list"
        ? ""
        : `/${collection}`;
  await page.goto(`/dashboard${path}`);
  const cards = page.getByTestId(collection === "github" ? "github-repository" : "link-card");
  await expect(cards).toHaveCount(8);
  await cards.first().scrollIntoViewIfNeeded();
  await settle(page);
  return cards;
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}

async function positions(cards: Locator) {
  return cards.evaluateAll((elements) =>
    elements.map((element) => {
      const { x, y } = element.getBoundingClientRect();
      return { id: element.getAttribute("data-link-id"), x, y };
    }),
  );
}

async function openEditor(page: Page, card: Locator, collection: Collection) {
  if (collection === "inbox") return card;
  if (collection === "x") {
    await card.getByRole("button", { name: "更多收藏操作" }).click();
    await page.getByRole("menuitem", { name: "编辑收藏" }).click();
  } else {
    await card
      .getByRole("button", {
        name: collection === "github" ? "编辑 GitHub 收藏" : "Edit link",
        exact: true,
      })
      .click();
  }
  const dialog = page.getByTestId("card-edit-dialog");
  await expect(dialog).toHaveAttribute("data-phase", "editing");
  if (collection === "list") {
    await expect(dialog.locator(".link-card-flight")).toHaveCount(0);
    await expect(card).toBeVisible();
    await dialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
  } else {
    await expect(card).toBeHidden();
  }
  return dialog;
}

async function confirmDelete(page: Page, editor: Locator) {
  await editor.getByRole("button", { name: "Delete link" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除", exact: true }).click();
}

async function pauseReflows(page: Page) {
  return page.evaluateHandle(() => {
    const animate = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      queueMicrotask(() => {
        if (animation.id === "card-reflow") {
          animation.pause();
          animation.currentTime = 0;
        }
      });
      return animation;
    };
    return () => {
      HTMLElement.prototype.animate = animate;
    };
  });
}

async function seekReflows(page: Page, time: number) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getAnimations().filter((animation) => animation.id === "card-reflow").length,
      ),
    )
    .toBeGreaterThan(0);
  await page.evaluate(async (currentTime) => {
    const animations = document
      .getAnimations()
      .filter((animation) => animation.id === "card-reflow");
    await Promise.all(animations.map((animation) => animation.ready));
    for (const animation of animations) animation.currentTime = currentTime;
    await new Promise(requestAnimationFrame);
  }, time);
}

function expectSamePositions(
  actual: Awaited<ReturnType<typeof positions>>,
  before: Awaited<ReturnType<typeof positions>>,
) {
  for (const position of actual) {
    const original = before.find(({ id }) => id === position.id);
    assert(original);
    expect(position.x).toBeCloseTo(original.x, 0);
    expect(position.y).toBeCloseTo(original.y, 0);
  }
}

for (const collection of ["grid", "list", "github", "x", "inbox"] as const) {
  test(`${collection}: deletion smoothly fills the vacancy`, async ({ page, owner }, info) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cards = await seedCollection(page, owner, collection);
    const id = await cards.first().getAttribute("data-link-id");
    const card = cards.and(page.locator(`[data-link-id="${id}"]`));
    let editor = await openEditor(page, card, collection);
    if (collection === "list" || collection === "github") {
      await editor.getByLabel("备注", { exact: true }).fill("Saved from the shared editor");
      await page.screenshot({ path: info.outputPath(`${collection}-editor.png`) });
      await editor.getByRole("button", { name: "保存", exact: true }).click();
      await expect(editor).not.toBeAttached();
      await expect(card).toContainText("Saved from the shared editor");
      await settle(page);
      editor = await openEditor(page, card, collection);
    }
    const before = await positions(cards);
    const restoreAnimations = await pauseReflows(page);
    await confirmDelete(page, editor);
    await expect(card).not.toBeAttached();
    await seekReflows(page, 0);
    expectSamePositions(await positions(cards), before);
    await seekReflows(page, 100);
    await page.screenshot({ path: info.outputPath(`${collection}-reflow.png`) });
    const middle = await positions(cards);
    expect(
      middle.some((position) => {
        const original = before.find(({ id: previousId }) => previousId === position.id);
        return original && Math.hypot(position.x - original.x, position.y - original.y) > 1;
      }),
    ).toBe(true);

    // A second deletion while the first movement is unfinished must start where
    // the cards are currently drawn, rather than jumping to an old destination.
    if (collection === "list") {
      const nextId = await cards.first().getAttribute("data-link-id");
      const nextCard = cards.and(page.locator(`[data-link-id="${nextId}"]`));
      await confirmDelete(page, await openEditor(page, nextCard, collection));
      await expect(nextCard).not.toBeAttached();
      await seekReflows(page, 0);
      expectSamePositions(await positions(cards), middle);
    }
    await restoreAnimations.evaluate((restore) => restore());
    await restoreAnimations.dispose();
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        if (animation.id === "card-reflow") animation.play();
      }
    });
    await settle(page);
    const after = await positions(cards);
    expect(after[0]?.x).toBeCloseTo(before[0]?.x ?? 0, 0);
    expect(after[0]?.y).toBeCloseTo(before[0]?.y ?? 0, 0);
    if (collection === "grid" || collection === "github") {
      expect(
        after.some((position) => {
          const original = before.find(({ id: previousId }) => previousId === position.id);
          return (
            original &&
            Math.abs(position.x - original.x) > 1 &&
            Math.abs(position.y - original.y) > 1
          );
        }),
      ).toBe(true);
    }
    expect(await queryD1("SELECT id FROM links WHERE user_id = ?", [owner])).toHaveLength(
      collection === "list" ? 6 : 7,
    );
    expect(
      await page
        .locator("[data-card-layout-item]")
        .evaluateAll((elements) =>
          elements.every((element) => getComputedStyle(element).transform === "none"),
        ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("reduced motion fills the vacancy immediately on a narrow screen", async ({ page, owner }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 800 });
  const cards = await seedCollection(page, owner, "grid");
  const before = await positions(cards);
  const card = cards.and(page.locator(`[data-link-id="${before[0]?.id}"]`));
  await confirmDelete(page, await openEditor(page, card, "grid"));
  await expect(card).not.toBeAttached();
  expect(
    await page.evaluate(
      () => document.getAnimations().filter((animation) => animation.id === "card-reflow").length,
    ),
  ).toBe(0);
  const after = await positions(cards);
  expect(after[0]?.x).toBeCloseTo(before[0]?.x ?? 0, 0);
  expect(after[0]?.y).toBeCloseTo(before[0]?.y ?? 0, 0);
});
