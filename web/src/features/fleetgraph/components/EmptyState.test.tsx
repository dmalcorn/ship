import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders positive message', () => {
    render(<EmptyState lastScanAt={null} />);
    expect(screen.getByText("No findings — you're in good shape.")).toBeInTheDocument();
  });

  it('has role="status" for accessibility', () => {
    render(<EmptyState lastScanAt={null} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has aria-live="polite"', () => {
    const { container } = render(<EmptyState lastScanAt={null} />);
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it('shows next scan countdown when lastScanAt is recent', () => {
    const recentScan = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
    render(<EmptyState lastScanAt={recentScan} />);
    expect(screen.getByText(/Next scan in/)).toBeInTheDocument();
  });

  it('shows "soon" when scan interval has elapsed', () => {
    const oldScan = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 min ago (> 3 min interval)
    render(<EmptyState lastScanAt={oldScan} />);
    expect(screen.getByText('Next scan in soon')).toBeInTheDocument();
  });

  it('does not show countdown when lastScanAt is null', () => {
    render(<EmptyState lastScanAt={null} />);
    expect(screen.queryByText(/Next scan in/)).not.toBeInTheDocument();
  });
});
