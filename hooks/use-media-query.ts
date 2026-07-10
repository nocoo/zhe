"use client";

import * as React from "react";

/**
 * Match `(max-width: (breakpoint-1)px)`. `breakpoint` defaults to 1024
 * (the docs/21-todos-feature.md — "Narrow viewport" cut-off between the
 * two-pane and stacked-Sheet layouts). Returns `false` during SSR / the
 * pre-mount tick so React renders a stable desktop-first shell and
 * upgrades on the next commit without a hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * True below the 1024 px "narrow" cut-off — matches the todos page's
 * two-pane / Sheet fallback threshold.
 */
export function useNarrowViewport(breakpoint = 1024): boolean {
  return useMediaQuery(`(max-width: ${breakpoint - 1}px)`);
}

/**
 * True when the primary pointer input is coarse (touch, stylus). Used to
 * disable arborist's nesting drag on touch surfaces — the doc's decision
 * was that DnD tree gestures are unreliable on touch, so add / edit /
 * check / delete / tag / due must be the primary path there.
 */
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}
