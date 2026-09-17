import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ConnectorError, record } from "./core.js";
import { type OpenCliPage, runOpenCliTask, withOpenCliPage } from "./opencli.js";
import {
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_HEIGHT,
  SCREENSHOT_VIEWPORT,
  SCREENSHOT_WIDTH,
  screenshotTarget,
  validateScreenshot,
} from "./screenshot-core.js";
import type { DownloadedMedia } from "./types.js";

const PAGE_STATE = `(() => {
  const visibleImages = [...document.images].filter(image => {
    const rect = image.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  });
  return { url: location.href, type: document.contentType, title: document.title,
    status: performance.getEntriesByType('navigation')[0]?.responseStatus ?? 0,
    ready: document.readyState === 'complete' && document.fonts.status === 'loaded' && visibleImages.every(image => image.complete),
    content: !!document.body && (document.body.childElementCount > 0 || document.body.innerText.trim().length > 0)
  };
})()`;

async function settlePage(page: OpenCliPage): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    // Navigation can replace the execution context while the page is loading.
    const state = record(await page.evaluate(PAGE_STATE).catch(() => null));
    if (typeof state.url === "string" && state.url !== "about:blank") {
      if (!screenshotTarget(state.url)) throw new ConnectorError("unsafe_screenshot_url");
      if (
        Number(state.status) >= 400 ||
        /^(just a moment|attention required|access denied|403 forbidden|404 not found)/i.test(
          String(state.title),
        )
      )
        throw new ConnectorError("screenshot_unavailable");
      if (
        state.ready &&
        state.content &&
        ["text/html", "application/xhtml+xml"].includes(String(state.type))
      ) {
        await delay(500); // Let layout and the first painted frame settle after fonts/images.
        return;
      }
    }
    await delay(500);
  }
  throw new ConnectorError("screenshot_unavailable");
}

export function captureScreenshot(
  url: string,
  directory: string,
  signal?: AbortSignal,
): Promise<DownloadedMedia> {
  if (!screenshotTarget(url)) throw new ConnectorError("unsafe_screenshot_url");
  return runOpenCliTask(["--screenshot", url, directory], signal);
}

export async function captureScreenshotInChild(
  url: string,
  directory: string,
): Promise<DownloadedMedia> {
  const target = screenshotTarget(url);
  if (!target) throw new ConnectorError("unsafe_screenshot_url");
  return withOpenCliPage(async (page) => {
    try {
      // An explicitly owned tab avoids OpenCLI's initial unbound-navigation failure.
      const id = await page.newTab(target);
      if (!id) throw new ConnectorError("opencli_unavailable");
      await page.setActivePage(id);
      await page.cdp("Emulation.setDeviceMetricsOverride", {
        ...SCREENSHOT_VIEWPORT,
        mobile: false,
      });
      await settlePage(page);
      const clip = {
        x: 0,
        y: 0,
        width: SCREENSHOT_VIEWPORT.width,
        height: SCREENSHOT_VIEWPORT.height,
        scale:
          SCREENSHOT_WIDTH / (SCREENSHOT_VIEWPORT.width * SCREENSHOT_VIEWPORT.deviceScaleFactor),
      };
      for (const quality of [80, 70, 60]) {
        // Recheck after layout settles, including delayed redirects to special sites.
        const current = await page.evaluate("location.href");
        if (typeof current !== "string" || !screenshotTarget(current))
          throw new ConnectorError("unsafe_screenshot_url");
        const result = record(
          await page.cdp("Page.captureScreenshot", {
            format: "webp",
            quality,
            fromSurface: true,
            captureBeyondViewport: false,
            clip,
          }),
        );
        if (typeof result.data !== "string") throw new ConnectorError("invalid_screenshot");
        if (result.data.length > Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4) continue;
        const bytes = Buffer.from(result.data, "base64");
        if (bytes.length > MAX_SCREENSHOT_BYTES) continue;
        validateScreenshot(bytes);
        const path = join(directory, "preview.webp");
        await writeFile(path, bytes, { mode: 0o600 });
        return {
          path,
          size: bytes.length,
          mime: "image/webp",
          width: SCREENSHOT_WIDTH,
          height: SCREENSHOT_HEIGHT,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      }
      throw new ConnectorError("screenshot_too_large");
    } catch (error) {
      throw error instanceof ConnectorError ? error : new ConnectorError("screenshot_unavailable");
    }
  });
}
