import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home Page', () => {
  it('renders without crashing', () => {
    render(<Home />);
    expect(screen.getByText('这')).toBeInTheDocument();
  });

  it('displays the tagline', () => {
    render(<Home />);
    expect(screen.getByText('Minimalist URL Shortener')).toBeInTheDocument();
  });

  it('displays the domain', () => {
    render(<Home />);
    expect(screen.getByText('zhe.to')).toBeInTheDocument();
  });
});
