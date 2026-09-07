import type { CSSProperties } from "react";

/** Cap so long lists don't stall the last items. */
const STAGGER_CAP = 12;

export function staggerStyle(index: number): CSSProperties {
  return {
    animationDelay: `calc(var(--motion-stagger) * ${Math.min(index, STAGGER_CAP)})`,
  };
}
