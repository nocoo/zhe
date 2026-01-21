import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoginPage from '@/app/(auth)/login/page';

describe('Login Page', () => {
  it('renders without crashing', () => {
    render(<LoginPage />);
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('displays Google sign in button', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });
});
