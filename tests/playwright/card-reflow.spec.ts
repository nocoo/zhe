import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import type { Locator, Page } from "@playwright/test";
import { uploadBufferToR2 } from "../../lib/r2/local-binding";
import { test as base, expect } from "./fixtures";
import { cardAction } from "./helpers/card-actions";
import { executeD1, queryD1 } from "./helpers/d1";

const test = base.extend<{ owner: string }>({
  owner: async ({ context, baseURL }, use) => {
    assert(baseURL === `http://localhost:${Number(process.env.ZHE_TEST_APP_PORT ?? 27006)}`);
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

type Collection = "grid" | "list" | "github" | "x";

const desktopWidths = [1728, 2056, 2559, 2560, 3360] as const;

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
        collection === "x" && index % 2
          ? "A longer saved post that takes several lines in the card. ".repeat(8)
          : "A useful reference.",
        "/logo-24.png",
        "/logo-80.png",
        now - index * 1000,
      ],
    );
  }
  await page.addInitScript((view) => localStorage.setItem("zhe_links_view_mode", view), collection);
  const path = collection === "grid" || collection === "list" ? "" : `/${collection}`;
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
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
  await (await cardAction(page, card, "修改收藏")).click();
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

async function confirmDelete(page: Page, card: Locator) {
  await (await cardAction(page, card, "删除收藏")).click();
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

for (const collection of ["grid", "list", "x", "github"] as const) {
  test(`${collection}: matching skeleton transitions into animated cards`, async ({
    page,
    owner,
  }) => {
    await page.setViewportSize({ width: 1365, height: 1000 });
    const cards = await seedCollection(page, owner, collection);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/dashboard**", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"])
        await gate;
      await route.continue();
    });
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      const skeleton = page.getByRole("status", { name: /^正在加载(?:卡片|列表)$/ });
      await expect(skeleton).toHaveCount(1);
      await expect(skeleton).toBeVisible();
      let before: { columns: string; height: number | undefined } | undefined;
      await expect
        .poll(async () => {
          before = await skeleton.evaluate((element) => ({
            columns: getComputedStyle(element).gridTemplateColumns,
            height: (
              element.querySelector(".animate-pulse") ?? element.firstElementChild
            )?.getBoundingClientRect().height,
          }));
          return before.height ?? 0;
        })
        .toBeGreaterThan(0);
      assert(before);
      if (collection === "list") expect(before.columns).toBe("none");
      if (collection !== "list") expect(before.height).toBeCloseTo(384, 2);
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(
        await skeleton
          .locator(".animate-pulse")
          .first()
          .evaluate((element) => getComputedStyle(element).animationName),
      ).toBe("none");
      await page.screenshot({
        path: `.artifacts/loading-${collection}.png`,
        animations: "disabled",
      });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const entrances = await page.evaluateHandle(() => {
        const names: string[] = [];
        document.addEventListener("animationstart", (event) => {
          if (event.animationName === "fade-up") names.push(event.animationName);
        });
        return names;
      });
      release();
      await expect(cards).toHaveCount(8);
      await expect
        .poll(() => entrances.evaluate((names) => names.length))
        .toBeGreaterThanOrEqual(8);
      await settle(page);
      const container = page.getByTestId(
        collection === "github"
          ? "github-repositories"
          : collection === "x"
            ? "x-feed"
            : collection === "grid"
              ? "card-grid"
              : "card-list",
      );
      expect(
        await container.evaluate((element) => getComputedStyle(element).gridTemplateColumns),
      ).toBe(before.columns);
      if (collection !== "list") {
        expect(
          await cards.first().evaluate((element) => element.getBoundingClientRect().height),
        ).toBeCloseTo(before.height ?? 0, 0);
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(
        await cards
          .first()
          .evaluate(
            (element) =>
              getComputedStyle(element.closest(".animate-fade-up") as HTMLElement).animationName,
          ),
      ).toBe("none");
    } finally {
      release();
    }
  });
}

for (const collection of ["grid", "x", "github"] as const) {
  test(`${collection}: column count follows available container width`, async ({
    page,
    owner,
  }, info) => {
    const cards = await seedCollection(page, owner, collection);
    const container = page.getByTestId(
      collection === "github" ? "github-repositories" : collection === "x" ? "x-feed" : "card-grid",
    );
    for (const width of desktopWidths) {
      await page.setViewportSize({ width, height: 1117 });
      await expect
        .poll(() =>
          container.evaluate((element) => {
            const style = getComputedStyle(element);
            const available = element.getBoundingClientRect().width;
            const gap = Number.parseFloat(style.columnGap);
            const minimum = Math.min(
              available,
              18 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
            );
            const expected = Math.max(1, Math.floor((available + gap) / (minimum + gap)));
            return style.gridTemplateColumns.split(" ").length === expected;
          }),
        )
        .toBe(true);
      const columns = await container.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
      );
      expect(
        await cards.evaluateAll((elements) => {
          const first = elements[0]?.getBoundingClientRect();
          return elements.filter(
            (element) => Math.abs(element.getBoundingClientRect().y - (first?.y ?? 0)) < 1,
          ).length;
        }),
      ).toBe(Math.min(columns, 8));
      if (width === 1728 || width === 3360) {
        await page.screenshot({
          path: info.outputPath(`${collection}-${width}.png`),
          animations: "disabled",
        });
      }
    }
  });
}

for (const collection of ["grid", "x", "github"] as const) {
  test(`${collection}: equal-height cards keep aligned footers and reading order on resize`, async ({
    page,
    owner,
  }) => {
    const cards = await seedCollection(page, owner, collection);
    for (let index = 0; index < 8; index++) {
      await expect(cards.nth(index)).toContainText(
        collection === "github"
          ? `motion/repository-${index}`
          : collection === "x"
            ? `/${owner}-${index}`
            : `Saved link ${index + 1}`,
      );
    }
    for (const width of [1280, 1920, 768, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await settle(page);
      const boxes = await cards.evaluateAll((elements) =>
        elements.map((element) => {
          const { x, y, height, bottom } = element.getBoundingClientRect();
          const footer = element.querySelector("[data-bookmark-footer]");
          const classification = element.querySelector("[data-bookmark-classification]");
          const actions = element.querySelector("[data-bookmark-action-row]");
          if (!footer || !classification || !actions) throw new Error("Missing unified footer");
          return {
            x,
            y,
            height,
            bottom,
            footerTop: footer.getBoundingClientRect().top - y,
            classificationTop: classification.getBoundingClientRect().top - y,
            actionsTop: actions.getBoundingClientRect().top - y,
            widths: [
              element.clientWidth,
              element.scrollWidth,
              footer.clientWidth,
              footer.scrollWidth,
            ],
            fits:
              element.scrollWidth <= element.clientWidth &&
              footer.scrollWidth <= footer.clientWidth,
          };
        }),
      );
      const first = boxes[0];
      assert(first);
      for (const [index, box] of boxes.entries()) {
        expect(box.height).toBeCloseTo(384, 2);
        expect(box.footerTop).toBeCloseTo(first.footerTop, 0);
        expect(box.classificationTop).toBeCloseTo(first.classificationTop, 0);
        expect(box.actionsTop).toBeCloseTo(first.actionsTop, 0);
        expect(box.actionsTop).toBeGreaterThan(box.classificationTop);
        expect(box.fits, JSON.stringify({ width, index, box })).toBe(true);
        const previous = boxes[index - 1];
        if (previous)
          expect(
            box.y > previous.y || (Math.abs(box.y - previous.y) < 1 && box.x > previous.x),
          ).toBe(true);
      }
      const nextRow = boxes.find((box) => box.y > first.y + 1);
      if (nextRow) expect(nextRow.y - first.bottom).toBeCloseTo(12, 0);
      await expect(cards.locator("[data-bookmark-action-row] time")).toHaveCount(8);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });
}

for (const collection of ["grid", "list", "github", "x"] as const) {
  test(`${collection}: deletion smoothly fills the vacancy`, async ({ page, owner }, info) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cards = await seedCollection(page, owner, collection);
    const id = await cards.first().getAttribute("data-link-id");
    const card = cards.and(page.locator(`[data-link-id="${id}"]`));
    if (collection === "list" || collection === "github") {
      const editor = await openEditor(page, card, collection);
      await editor.getByLabel("备注", { exact: true }).fill("Saved from the shared editor");
      await page.screenshot({ path: info.outputPath(`${collection}-editor.png`) });
      await editor.getByRole("button", { name: "保存", exact: true }).click();
      await expect(editor).not.toBeAttached();
      await expect(card).toContainText("Saved from the shared editor");
      await settle(page);
    }
    const before = await positions(cards);
    const restoreAnimations = await pauseReflows(page);
    await confirmDelete(page, card);
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
      await confirmDelete(page, nextCard);
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
    if (collection !== "list") {
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
  await confirmDelete(page, card);
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

for (const collection of ["grid", "list", "github", "x"] as const) {
  test(`${collection}: bulk selection deletes sequentially with modal progress`, async ({
    page,
    owner,
  }) => {
    await page.setViewportSize({ width: collection === "x" ? 390 : 1365, height: 1000 });
    const cards = await seedCollection(page, owner, collection);
    const rows = await queryD1<{ id: number; original_url: string }>(
      "SELECT id,original_url FROM links WHERE user_id=? ORDER BY created_at DESC",
      [owner],
    );
    const targets = rows.slice(0, 2);
    const assets: string[] = [];
    if (collection === "x") {
      assert(process.env.LOCAL_R2 === "1");
      for (const link of targets) {
        const postId = link.original_url.split("/").at(-1);
        await executeD1(
          "INSERT INTO x_bookmarks(link_id,user_id,source_url,post_id,state,updated_at) VALUES(?,?,?,?,'pending',?) ON CONFLICT(link_id) DO NOTHING",
          [link.id, owner, link.original_url, postId, Date.now()],
        );
        for (const kind of ["video", "poster"] as const) {
          const key = `fixture/${owner}/${link.id}-${kind}`;
          const bytes = Buffer.from(`synthetic ${kind}`);
          await uploadBufferToR2(key, bytes, "application/octet-stream");
          const url = `${process.env.R2_PUBLIC_DOMAIN}/${key}`;
          assets.push(url);
          const [upload] = await queryD1<{ id: number }>(
            "INSERT INTO uploads(user_id,key,file_name,file_type,file_size,public_url,created_at) VALUES(?,?,?,'application/octet-stream',?,?,?) RETURNING id",
            [owner, key, `${kind}.bin`, bytes.length, url, Date.now()],
          );
          assert(upload);
          await executeD1(
            "INSERT INTO x_media(id,link_id,user_id,media_id,kind,r2_key,mime,size,sha256,lease_token,state,upload_id,created_at) VALUES(?,?,?,?,?,?,'application/octet-stream',?,?,'fixture','published',?,?)",
            [
              randomUUID(),
              link.id,
              owner,
              "same-media",
              kind,
              key,
              bytes.length,
              createHash("sha256").update(bytes).digest("hex"),
              upload.id,
              Date.now(),
            ],
          );
        }
      }
    }
    const height = await cards
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);
    await page.getByRole("button", { name: "多选卡片" }).click();
    const choices = page.getByRole("checkbox", { name: /^选择 / });
    await expect(choices).toHaveCount(8);
    await choices.first().check();
    await page
      .locator("label")
      .filter({ has: page.getByRole("checkbox", { name: /^选择 / }) })
      .nth(1)
      .click({ position: { x: 70, y: 40 } });
    await expect(choices.nth(1)).toBeChecked();
    expect(await cards.first().evaluate((element) => element.getBoundingClientRect().height)).toBe(
      height,
    );
    expect(await cards.first().evaluate((element) => !!element.closest("[inert]"))).toBe(true);
    const deleteSelected = page
      .getByRole("group", { name: collection === "x" ? "浮动多选操作" : "多选操作", exact: true })
      .getByRole("button", { name: "删除所选" });
    await deleteSelected.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.artifacts/bulk-selection-${collection}.png`,
      animations: "disabled",
    });
    await deleteSelected.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("heading", { name: "删除 2 项内容？" })).toBeVisible();
    await dialog.getByRole("button", { name: "取消" }).click();
    expect(await queryD1("SELECT id FROM links WHERE user_id=?", [owner])).toHaveLength(8);
    await deleteSelected.click();
    let release: () => void = () => {};
    let releaseSecond: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const requests: number[] = [];
    await page.route("**/dashboard**", async (route) => {
      const target = targets.find(({ id }) => route.request().postData() === JSON.stringify([id]));
      if (route.request().headers()["next-action"] && target) {
        requests.push(target.id);
        if (requests.length === 1) await gate;
        if (requests.length === 2) {
          if (assets[0]) expect((await fetch(assets[0])).status).toBe(404);
          await secondGate;
        }
      }
      await route.continue();
    });
    try {
      await dialog.getByRole("button", { name: "确认删除" }).click();
      await expect.poll(() => requests.length).toBe(1);
      await expect(dialog.getByRole("progressbar")).toHaveAttribute("value", "0");
      await expect(dialog.getByRole("button", { name: "取消" })).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      release();
      await expect.poll(() => requests.length).toBe(2);
      await expect(dialog.getByRole("progressbar")).toHaveAttribute("value", "1");
      await page.screenshot({
        path: `.artifacts/bulk-progress-${collection}.png`,
        animations: "disabled",
      });
      releaseSecond();
      await expect(dialog.getByRole("status")).toContainText("已删除 2 项");
      expect(requests).toEqual(targets.map(({ id }) => id));
      await expect(dialog.getByRole("progressbar")).toHaveAttribute("value", "2");
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
      await expect(cards).toHaveCount(6);
      await expect(page.getByRole("button", { name: "多选卡片" })).toBeFocused();
      expect(await queryD1("SELECT id FROM links WHERE user_id=?", [owner])).toHaveLength(6);
      for (const url of assets) expect((await fetch(url)).status).toBe(404);
      if (assets.length) {
        expect(await queryD1("SELECT id FROM x_media WHERE user_id=?", [owner])).toEqual([]);
        expect(await queryD1("SELECT id FROM uploads WHERE user_id=?", [owner])).toEqual([]);
        expect(await queryD1("SELECT key FROM r2_deletions WHERE user_id=?", [owner])).toEqual([]);
      }
    } finally {
      release();
      releaseSecond();
    }
  });
}

for (const [collection, width] of [
  ["github", 1365],
  ["x", 320],
] as const) {
  test(`${collection}: bulk toolbar remains accessible while scrolling`, async ({
    page,
    owner,
  }) => {
    await page.setViewportSize({ width, height: 680 });
    const cards = await seedCollection(page, owner, collection);
    const floating = page.getByRole("group", { name: "浮动多选操作", exact: true });
    await expect(floating).toHaveCount(0);
    await page.getByRole("button", { name: "多选卡片" }).click();
    const top =
      collection === "x" ? floating : page.getByRole("group", { name: "多选操作", exact: true });
    await expect(top).toBeInViewport();
    if (collection !== "x") await expect(floating).toHaveCount(0);
    await top.getByRole("button", { name: "全选当前列表" }).click();
    await cards.last().scrollIntoViewIfNeeded();
    if (collection !== "x") await expect(top).not.toBeInViewport();
    await expect(floating).toBeVisible();
    await expect(floating.getByRole("status")).toHaveText("已选 8 项");
    const box = await floating.boundingBox();
    assert(box);
    expect(box.x + box.width / 2).toBeCloseTo(width / 2, 0);
    expect(box.y + box.height).toBeLessThan(680);
    expect(box.width).toBeLessThan(width);
    await floating.getByRole("button", { name: "取消全选" }).click();
    await expect(top.getByRole("status")).toHaveText("已选 0 项");
    await expect(floating.getByRole("button", { name: "删除所选" })).toBeDisabled();
    await floating.getByRole("button", { name: "全选当前列表" }).click();
    await floating.getByRole("button", { name: "删除所选" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("heading", { name: "删除 8 项内容？" })).toBeVisible();
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(floating.getByRole("button", { name: "删除所选" })).toBeFocused();
    if (collection !== "x") await expect(top).not.toBeInViewport();
    await page.screenshot({
      path: `.artifacts/bulk-floating-${collection}-${width}.png`,
      animations: "disabled",
    });
    await cards.first().scrollIntoViewIfNeeded();
    if (collection !== "x") {
      await top.scrollIntoViewIfNeeded();
      await expect(floating).toHaveCount(0);
    } else await expect(floating).toBeInViewport();
    await expect(top.getByRole("status")).toHaveText("已选 8 项");
    await cards.last().scrollIntoViewIfNeeded();
    await expect(floating).toBeVisible();
    await floating.getByRole("button", { name: "退出多选" }).click();
    await expect(floating).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /^选择 / })).toHaveCount(0);
    expect(await queryD1("SELECT id FROM links WHERE user_id=?", [owner])).toHaveLength(8);
  });
}

for (const collection of ["ideas", "uploads"] as const) {
  test(`${collection}: bulk deletion uses the collection's existing deletion flow`, async ({
    page,
    owner,
  }) => {
    assert(process.env.LOCAL_R2 === "1");
    const assets: string[] = [];
    for (let index = 0; index < 3; index++) {
      if (collection === "ideas") {
        await executeD1(
          "INSERT INTO ideas(user_id,title,content,excerpt,created_at,updated_at) VALUES(?,?,?,?,?,?)",
          [owner, `Idea ${index}`, "Saved content", "Saved content", Date.now(), Date.now()],
        );
      } else {
        const key = `fixture/${owner}/file-${index}.txt`;
        const url = `${process.env.R2_PUBLIC_DOMAIN}/${key}`;
        await uploadBufferToR2(key, Buffer.from("saved file"), "text/plain");
        assets.push(url);
        await executeD1(
          "INSERT INTO uploads(user_id,key,file_name,file_type,file_size,public_url,created_at) VALUES(?,?,?,'text/plain',10,?,?)",
          [owner, key, `File ${index}`, url, Date.now()],
        );
      }
    }
    await page.goto(`/dashboard/${collection}`);
    await expect(page.getByRole("button", { name: "多选卡片" })).toBeEnabled();
    await page.getByRole("button", { name: "多选卡片" }).click();
    await page.getByRole("button", { name: "全选当前列表" }).click();
    await expect(page.getByRole("checkbox", { name: /^选择 / }).first()).toBeChecked();
    await page.getByRole("button", { name: "删除所选" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "确认删除" }).click();
    await expect(dialog.getByRole("status")).toContainText("已删除 3 项");
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("button", { name: "多选卡片" })).toBeDisabled();
    expect(await queryD1(`SELECT id FROM ${collection} WHERE user_id=?`, [owner])).toEqual([]);
    for (const url of assets) expect((await fetch(url)).status).toBe(404);
  });
}

for (const collection of ["grid", "list", "github", "x"] as const) {
  test(`${collection}: hidden posts persist while the reveal toggle resets`, async ({
    page,
    owner,
  }) => {
    const cards = await seedCollection(page, owner, collection);
    const path = page.url();
    const id = await cards.first().getAttribute("data-link-id");
    const card = cards.and(page.locator(`[data-link-id="${id}"]`));
    const toggle = page.getByRole("button", { name: "展示隐藏", exact: true });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await (await cardAction(page, card, "隐藏帖子")).click();
    await expect(cards).toHaveCount(7);
    await expect(page.getByText("帖子已隐藏", { exact: true })).toBeVisible();
    expect(
      await queryD1("SELECT is_hidden FROM links WHERE id=? AND user_id=?", [Number(id), owner]),
    ).toEqual([{ is_hidden: 1 }]);
    await settle(page);
    const restore = await pauseReflows(page);
    await toggle.click();
    await expect(cards).toHaveCount(8);
    await seekReflows(page, 100);
    await seekReflows(page, 400);
    await restore.evaluate((reset) => reset());
    await expect(await cardAction(page, card, "取消隐藏")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(cards).toHaveCount(7);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(cards).toHaveCount(8);
    const destination = collection === "github" ? "X 收藏" : "GitHub 收藏";
    await page.getByRole("link", { name: destination, exact: true }).first().click();
    await expect(page).toHaveURL(
      collection === "github" ? /\/dashboard\/x$/ : /\/dashboard\/github$/,
    );
    await page.goBack();
    await expect(page).toHaveURL(path);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(cards).toHaveCount(7);
    await toggle.click();
    await expect(cards).toHaveCount(8);
    await settle(page);
    await (await cardAction(page, card, "取消隐藏")).click();
    await expect(page.getByText("已取消隐藏", { exact: true })).toBeVisible();
    await toggle.click();
    await expect(cards).toHaveCount(8);
    expect(
      await queryD1("SELECT is_hidden FROM links WHERE id=? AND user_id=?", [Number(id), owner]),
    ).toEqual([{ is_hidden: 0 }]);
  });
}
