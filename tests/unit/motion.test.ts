// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { CARD_MOTION_EASING, canAnimate, destroyCard, staggerStyle } from "@/lib/motion";

describe("motion utilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports CARD_MOTION_EASING and caps staggerStyle at 12", () => {
    expect(CARD_MOTION_EASING).toBe("cubic-bezier(0.22, 0.75, 0.25, 1)");
    expect(staggerStyle(0)).toEqual({
      animationDelay: "calc(var(--motion-stagger) * 0)",
    });
    expect(staggerStyle(5)).toEqual({
      animationDelay: "calc(var(--motion-stagger) * 5)",
    });
    expect(staggerStyle(99)).toEqual({
      animationDelay: "calc(var(--motion-stagger) * 12)",
    });
  });

  it("checks canAnimate against element.animate and reduced motion", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "animate", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(canAnimate(el)).toBe(false);

    Object.defineProperty(el, "animate", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    expect(canAnimate(el)).toBe(false);

    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    expect(canAnimate(el)).toBe(true);
  });

  it("destroyCard skips null or non-animatable elements", async () => {
    await expect(destroyCard(null)).resolves.toBeUndefined();

    const el = document.createElement("div");
    const animateMock = vi.fn();
    Object.defineProperty(el, "animate", {
      value: animateMock,
      configurable: true,
      writable: true,
    });
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);

    await destroyCard(el);
    expect(animateMock).not.toHaveBeenCalled();
  });

  it("destroyCard animates, sets opacity to 0, cancels, and ignores rejected finished", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);

    const el = document.createElement("div");
    const cancel = vi.fn();
    const animateMock = vi.fn().mockReturnValue({
      finished: Promise.resolve(),
      cancel,
    });
    Object.defineProperty(el, "animate", {
      value: animateMock,
      configurable: true,
      writable: true,
    });

    await destroyCard(el);
    expect(animateMock).toHaveBeenCalledTimes(1);
    expect(el.style.opacity).toBe("0");
    expect(cancel).toHaveBeenCalledTimes(1);

    const rejectCancel = vi.fn();
    const el2 = document.createElement("div");
    Object.defineProperty(el2, "animate", {
      value: vi.fn().mockReturnValue({
        finished: Promise.reject(new Error("aborted")),
        cancel: rejectCancel,
      }),
      configurable: true,
      writable: true,
    });

    await destroyCard(el2);
    expect(el2.style.opacity).toBe("0");
    expect(rejectCancel).toHaveBeenCalledTimes(1);
  });
});
