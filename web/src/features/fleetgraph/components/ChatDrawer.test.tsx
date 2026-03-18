import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatDrawer } from './ChatDrawer';
import type { ChatMessage } from '../types';
import { createRef } from 'react';

function renderDrawer(overrides: Partial<Parameters<typeof ChatDrawer>[0]> = {}) {
  const fabRef = overrides.fabRef ?? createRef<HTMLButtonElement>();
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    messages: [] as ChatMessage[],
    isLoading: false,
    onSend: vi.fn(),
    onRetry: vi.fn(),
    documentType: 'issue' as string | null,
    documentTitle: 'Bug #42',
    fabRef,
    ...overrides,
  };
  return { ...render(<ChatDrawer {...props} />), props };
}

describe('ChatDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with role="dialog" and aria-label', () => {
    renderDrawer();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'FleetGraph Chat');
  });

  it('shows document context in header', () => {
    renderDrawer({ documentType: 'issue', documentTitle: 'Bug #42' });
    expect(screen.getByText('Issue: Bug #42')).toBeInTheDocument();
  });

  it('shows sprint context label for sprint type', () => {
    renderDrawer({ documentType: 'sprint', documentTitle: 'Sprint 13' });
    expect(screen.getByText('Sprint: Sprint 13')).toBeInTheDocument();
  });

  it('returns null when not open', () => {
    const { container } = renderDrawer({ isOpen: false });
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const { props } = renderDrawer();
    fireEvent.click(screen.getByLabelText('Close chat'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const { props } = renderDrawer();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });

  it('calls onClose on click outside', () => {
    const { props } = renderDrawer();
    fireEvent.mouseDown(document);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('does not call onClose on click inside', () => {
    const { props } = renderDrawer();
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('renders user messages', () => {
    renderDrawer({
      messages: [{ id: 'msg-1', role: 'user', content: 'What is the status?' }],
    });
    expect(screen.getByText('What is the status?')).toBeInTheDocument();
  });

  it('renders analyzing indicator when loading', () => {
    renderDrawer({ isLoading: true });
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });

  it('does not render analyzing indicator when not loading', () => {
    renderDrawer({ isLoading: false });
    expect(screen.queryByText('Analyzing...')).not.toBeInTheDocument();
  });

  it('renders error message with retry button', () => {
    renderDrawer({
      messages: [
        { id: 'msg-1', role: 'user', content: 'Question' },
        { id: 'msg-2', role: 'agent', content: '__ERROR__' },
      ],
    });
    expect(screen.getByText('Unable to analyze. Try again.')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('calls onRetry when retry button clicked', () => {
    const { props } = renderDrawer({
      messages: [
        { id: 'msg-1', role: 'user', content: 'Question' },
        { id: 'msg-2', role: 'agent', content: '__ERROR__' },
      ],
    });
    fireEvent.click(screen.getByText('Retry'));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('has aria-live="polite" on message container', () => {
    const { container } = renderDrawer();
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it('has z-50 for top overlay', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('z-50');
  });
});
