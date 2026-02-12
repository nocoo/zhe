import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls redirect to root path', async () => {
    // Dynamic import so the mock is in place before module executes
    const { default: LoginPage } = await import('@/app/(auth)/login/page');

    // redirect() throws in Next.js runtime; our mock just records the call
    LoginPage();

    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('redirect is called exactly once', async () => {
    const { default: LoginPage } = await import('@/app/(auth)/login/page');
    LoginPage();

    expect(redirect).toHaveBeenCalledTimes(1);
  });
});
