import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FleetGraphFAB } from './FleetGraphFAB';

describe('FleetGraphFAB', () => {
  it('renders when visible is true', () => {
    render(<FleetGraphFAB onClick={vi.fn()} visible={true} />);
    expect(screen.getByLabelText('Ask FleetGraph')).toBeInTheDocument();
  });

  it('does not render when visible is false', () => {
    render(<FleetGraphFAB onClick={vi.fn()} visible={false} />);
    expect(screen.queryByLabelText('Ask FleetGraph')).not.toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<FleetGraphFAB onClick={onClick} visible={true} />);
    fireEvent.click(screen.getByLabelText('Ask FleetGraph'));
    expect(onClick).toHaveBeenCalled();
  });

  it('has correct aria-label', () => {
    render(<FleetGraphFAB onClick={vi.fn()} visible={true} />);
    expect(screen.getByLabelText('Ask FleetGraph')).toBeInTheDocument();
  });

  it('has fixed positioning with z-40', () => {
    render(<FleetGraphFAB onClick={vi.fn()} visible={true} />);
    const btn = screen.getByLabelText('Ask FleetGraph');
    expect(btn.className).toContain('fixed');
    expect(btn.className).toContain('z-40');
  });

  it('has correct styling classes', () => {
    render(<FleetGraphFAB onClick={vi.fn()} visible={true} />);
    const btn = screen.getByLabelText('Ask FleetGraph');
    expect(btn.className).toContain('bg-[#005ea2]');
    expect(btn.className).toContain('rounded-full');
  });
});
