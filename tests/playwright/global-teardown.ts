import { stopLocalStack } from "../../scripts/test-stack";
export default async function globalTeardown(): Promise<void> {
  const stack = globalThis.__LOCAL_STACK__;
  if (!stack) return;
  await stopLocalStack(stack, true);
  globalThis.__LOCAL_STACK__ = undefined;
}
