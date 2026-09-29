import type { Page, TestInfo } from "@playwright/test";

export async function attachOverlayEvidence(page: Page, info: TestInfo) {
  try {
    const state = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        time: performance.now(),
        visibility: document.visibilityState,
        focused: document.hasFocus(),
        active: active && {
          tag: active.tagName,
          role: active.getAttribute("role"),
          label: active.getAttribute("aria-label"),
        },
        bodyPointerEvents: document.body.style.pointerEvents,
        overlays: Array.from(document.querySelectorAll('[role="menu"], [role="dialog"]')).map(
          (element) => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return {
              role: element.getAttribute("role"),
              state: element.getAttribute("data-state"),
              id: element.id,
              box: { x: box.x, y: box.y, width: box.width, height: box.height },
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
              animationName: style.animationName,
              animationDuration: style.animationDuration,
              animationDelay: style.animationDelay,
              animationPlayState: style.animationPlayState,
              animations: element.getAnimations().map((animation) => ({
                state: animation.playState,
                currentTime: animation.currentTime,
                timing: animation.effect?.getComputedTiming(),
              })),
            };
          },
        ),
      };
    });
    await info.attach("overlay-state-before-screenshot", {
      body: JSON.stringify(state, null, 2),
      contentType: "application/json",
    });
  } catch (error) {
    console.error("Could not capture overlay failure evidence", error);
  }
}
