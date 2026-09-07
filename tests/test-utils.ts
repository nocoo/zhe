import { ThemeProvider } from "@nocoo/basalt/providers/theme";
import { createElement, type ReactNode } from "react";
import { expect } from "vitest";

/** Wrap UI in Basalt ThemeProvider so `useTheme()` does not throw in tests. */
export function withTheme(node: ReactNode) {
  return createElement(ThemeProvider, {
    persist: false,
    applyToDocument: false,
    defaultTheme: "system",
    // biome-ignore lint/correctness/noChildrenProp: ThemeProviderProps requires children
    children: node,
  });
}

/**
 * Assert a value is neither `null` nor `undefined` and return it narrowed.
 *
 * Replaces the `value!` non-null assertion pattern in tests with a
 * runtime check that produces a clear failure message.
 *
 * @example
 *   const data = unwrap(result.data); // throws if data is nullish
 *   expect(data.slug).toBe('foo');
 */
export function unwrap<T>(value: T | null | undefined, message?: string): T {
  expect(value, message ?? "expected value to be defined").toBeDefined();
  expect(value, message ?? "expected value to be non-null").not.toBeNull();
  return value as T;
}
