import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { redirect } from 'next/navigation';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: mockAuth,
  signIn: vi.fn(),
}));

// Mock next/image to a plain img
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn(), resolvedTheme: 'light' }),
}));

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects to /dashboard when user is authenticated', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'u1', name: 'Test', email: 'test@test.com' },
      expires: '',
    });

    const { default: Home } = await import('@/app/page');
    await Home();

    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('renders login card when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const { default: Home } = await import('@/app/page');
    const result = await Home();

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('login card contains Google sign-in button', async () => {
    mockAuth.mockResolvedValue(null);

    const { default: Home } = await import('@/app/page');
    const jsx = await Home();
    render(jsx);

    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });

  it('displays welcome heading', async () => {
    mockAuth.mockResolvedValue(null);

    const { default: Home } = await import('@/app/page');
    const jsx = await Home();
    render(jsx);

    expect(screen.getByText('就是这')).toBeInTheDocument();
  });

  it('displays terms of service text', async () => {
    mockAuth.mockResolvedValue(null);

    const { default: Home } = await import('@/app/page');
    const jsx = await Home();
    render(jsx);

    expect(screen.getByText('点击登录即表示您同意服务条款')).toBeInTheDocument();
  });

  it('displays GitHub link', async () => {
    mockAuth.mockResolvedValue(null);

    const { default: Home } = await import('@/app/page');
    const jsx = await Home();
    render(jsx);

    const link = screen.getByTitle('GitHub');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://github.com/nocoo/zhe');
  });

  it('displays theme toggle', async () => {
    mockAuth.mockResolvedValue(null);

    const { default: Home } = await import('@/app/page');
    const jsx = await Home();
    render(jsx);

    expect(screen.getByTitle('Theme: system')).toBeInTheDocument();
  });
});
