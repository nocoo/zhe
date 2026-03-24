import { expect } from 'vitest';

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
  expect(value, message ?? 'expected value to be defined').toBeDefined();
  expect(value, message ?? 'expected value to be non-null').not.toBeNull();
  return value as T;
}
