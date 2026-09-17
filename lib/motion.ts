import type { CSSProperties } from "react";

/** Cap so long lists don't stall the last items. */
const STAGGER_CAP = 12;

export const CARD_MOTION_EASING = "cubic-bezier(0.22, 0.75, 0.25, 1)";

export function canAnimate(element: HTMLElement) {
  return !!element.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Keep the card in its layout slot until the successful deletion finishes. */
export async function destroyCard(element: HTMLElement | null) {
  if (!element || !canAnimate(element)) return;
  const animation = element.animate(
    [
      { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0px)" },
      { opacity: 1, transform: "translateY(-4px) scale(1.015)", offset: 0.2 },
      { opacity: 0, transform: "translateY(24px) scale(0.86) rotate(2deg)", filter: "blur(12px)" },
    ],
    { duration: 380, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
  );
  await animation.finished.catch(() => {});
  element.style.opacity = "0";
  animation.cancel();
}

export function staggerStyle(index: number): CSSProperties {
  return {
    animationDelay: `calc(var(--motion-stagger) * ${Math.min(index, STAGGER_CAP)})`,
  };
}
