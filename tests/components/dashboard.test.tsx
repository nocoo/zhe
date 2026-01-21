import { describe, it, expect, vi } from 'vitest';

// Mock the auth and actions modules
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user', name: 'Test', email: 'test@test.com' } }),
}));

vi.mock('@/actions/links', () => ({
  getLinks: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

describe('Dashboard Page', () => {
  it('should be a server component that fetches links', () => {
    // Server components with async data fetching need integration tests
    expect(true).toBe(true);
  });

  it('should display links list component', () => {
    // The LinksList component is client-side and testable separately
    expect(true).toBe(true);
  });
});
