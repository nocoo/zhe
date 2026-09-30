import type { BrowserContext, Page, TestInfo } from "@playwright/test";

type OverlayTrace = { events: Record<string, unknown>[]; dropped: number };
type TracedWindow = Window & { __zheOverlayTrace?: OverlayTrace };

export async function installOverlayEvidence(context: BrowserContext) {
  await context.addInitScript(() => {
    const trace: OverlayTrace = { events: [], dropped: 0 };
    (window as TracedWindow).__zheOverlayTrace = trace;
    const ids = new WeakMap<Element, number>();
    const watched = new WeakSet<Element>();
    let nextId = 0;
    const describe = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      if (!ids.has(target)) ids.set(target, ++nextId);
      return {
        node: ids.get(target),
        tag: target.tagName,
        id: target.id,
        role: target.getAttribute("role"),
        state: target.getAttribute("data-state"),
        connected: target.isConnected,
      };
    };
    const record = (type: string, details: Record<string, unknown>) => {
      if (trace.events.length === 256) {
        trace.events.shift();
        trace.dropped++;
      }
      trace.events.push({ time: performance.now(), type, ...details });
    };
    const selector = '[role="dialog"], [role="menu"]';
    const observeNode = (node: Element) => {
      if (watched.has(node)) return;
      watched.add(node);
      for (const type of ["focusScope.autoFocusOnMount", "focusScope.autoFocusOnUnmount"]) {
        node.addEventListener(type, (event) => {
          record(type, { target: describe(node), active: describe(document.activeElement) });
          queueMicrotask(() =>
            record(`${type}:after`, {
              target: describe(node),
              active: describe(document.activeElement),
              defaultPrevented: event.defaultPrevented,
            }),
          );
        });
      }
    };
    const nodes = (node: Node) => {
      if (!(node instanceof Element)) return [];
      return [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)];
    };
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          if (mutation.target.matches(selector)) {
            record("state", {
              target: describe(mutation.target),
              oldValue: mutation.oldValue,
            });
          }
        }
        for (const added of mutation.addedNodes) {
          for (const node of nodes(added)) {
            observeNode(node);
            record("added", { target: describe(node) });
          }
        }
        for (const removed of mutation.removedNodes) {
          for (const node of nodes(removed)) record("removed", { target: describe(node) });
        }
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state"],
      attributeOldValue: true,
    });
    for (const type of [
      "animationstart",
      "animationend",
      "animationcancel",
      "animationiteration",
    ]) {
      document.addEventListener(
        type,
        (event) => {
          if (
            !(event instanceof AnimationEvent) ||
            !(event.target instanceof Element) ||
            (!event.target.matches(selector) && !event.animationName.startsWith("basalt-overlay-"))
          )
            return;
          record(type, {
            target: describe(event.target),
            name: event.animationName,
            elapsed: event.elapsedTime,
          });
        },
        { capture: true, passive: true },
      );
    }
    for (const type of ["focusin", "focusout", "pointerdown", "pointerup", "click", "keydown"]) {
      document.addEventListener(
        type,
        (event) => {
          if (event instanceof KeyboardEvent && !["Escape", "Enter", "Tab"].includes(event.key))
            return;
          record(type, {
            target: describe(event.target),
            active: describe(document.activeElement),
            key: event instanceof KeyboardEvent ? event.key : undefined,
            button: event instanceof MouseEvent ? event.button : undefined,
            pointerType: event instanceof PointerEvent ? event.pointerType : undefined,
          });
        },
        { capture: true, passive: true },
      );
    }
    window.addEventListener("resize", () =>
      record("resize", { width: window.innerWidth, height: window.innerHeight }),
    );
    document.addEventListener("visibilitychange", () =>
      record("visibility", { value: document.visibilityState }),
    );
  });
}

export async function attachOverlayEvidence(page: Page, info: TestInfo) {
  if (info.attachments.some((attachment) => attachment.name === "overlay-state-before-screenshot"))
    return;
  try {
    // Style reads can change animation scheduling; collect them only after the original assertion fails.
    const state = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        time: performance.now(),
        timelineTime: document.timeline.currentTime,
        visibility: document.visibilityState,
        focused: document.hasFocus(),
        active: active && {
          tag: active.tagName,
          role: active.getAttribute("role"),
          label: active.getAttribute("aria-label"),
        },
        bodyPointerEvents: document.body.style.pointerEvents,
        trace: (window as TracedWindow).__zheOverlayTrace,
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
                pending: animation.pending,
                startTime: animation.startTime,
                currentTime: animation.currentTime,
                timelineTime: animation.timeline?.currentTime,
                playbackRate: animation.playbackRate,
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
