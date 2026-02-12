import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFound from '@/app/not-found';

describe('Not Found Page', () => {
  it('renders 404 message', () => {
    render(<NotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('has a back to home link', () => {
    render(<NotFound />);
    expect(screen.getByText('返回首页')).toBeInTheDocument();
  });
});
