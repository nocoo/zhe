/**
 * Playwright global teardown — clean up E2E test data and stop the local stack.
 *
 * globalSetup (same Node process) stashed the LocalStack handle on globalThis;
 * we reuse that to tear down the wrangler/R2 subprocess.
 */
import { stopLocalStack, type LocalStack } from '../../scripts/test-stack';
import { executeD1 } from './helpers/d1';

declare global {
  var __LOCAL_STACK__: LocalStack | undefined;
}

const E2E_USER_ID = 'e2e-test-user-id';

export default async function globalTeardown(): Promise<void> {
  console.log('[pw:global-teardown] Cleaning up E2E test data...');

  await executeD1('DELETE FROM links WHERE user_id = ?', [E2E_USER_ID], { softFail: true });
  await executeD1('DELETE FROM folders WHERE user_id = ?', [E2E_USER_ID], { softFail: true });
  await executeD1('DELETE FROM tags WHERE user_id = ?', [E2E_USER_ID], { softFail: true });
  await executeD1('DELETE FROM uploads WHERE user_id = ?', [E2E_USER_ID], { softFail: true });
  await executeD1('DELETE FROM webhooks WHERE user_id = ?', [E2E_USER_ID], { softFail: true });

  const stack = globalThis.__LOCAL_STACK__;
  if (stack) {
    await stopLocalStack(stack);
    globalThis.__LOCAL_STACK__ = undefined;
  }

  console.log('[pw:global-teardown] Done.');
}
