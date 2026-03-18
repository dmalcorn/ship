import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BadgeCount } from './BadgeCount';

describe('BadgeCount', () => {
  it('renders count when count > 0', () => {
    render(<BadgeCount count={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders nothing when count is 0', () => {
    const { container } = render(<BadgeCount count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when count is negative', () => {
    const { container } = render(<BadgeCount count={-1} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows 99+ for counts over 99', () => {
    render(<BadgeCount count={150} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('has aria-hidden="true"', () => {
    const { container } = render(<BadgeCount count={3} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
