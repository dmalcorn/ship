import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatMessageBubble } from './ChatMessageBubble';

describe('ChatMessageBubble', () => {
  it('renders user message right-aligned with correct styles', () => {
    const { container } = render(
      <ChatMessageBubble message={{ id: 'm1', role: 'user', content: 'Hello' }} />
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('justify-end');
  });

  it('renders agent message left-aligned', () => {
    const { container } = render(
      <ChatMessageBubble message={{ id: 'm1', role: 'agent', content: 'Analysis complete' }} />
    );
    expect(screen.getByText('Analysis complete')).toBeInTheDocument();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('justify-start');
  });

  it('renders error state with retry button', () => {
    const onRetry = vi.fn();
    render(<ChatMessageBubble message={{ id: 'm1', role: 'agent', content: '__ERROR__' }} onRetry={onRetry} />);
    expect(screen.getByText('Unable to analyze. Try again.')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('calls onRetry when retry clicked', () => {
    const onRetry = vi.fn();
    render(<ChatMessageBubble message={{ id: 'm1', role: 'agent', content: '__ERROR__' }} onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('does not show retry button when no onRetry provided for error', () => {
    render(<ChatMessageBubble message={{ id: 'm1', role: 'agent', content: '__ERROR__' }} />);
    expect(screen.getByText('Unable to analyze. Try again.')).toBeInTheDocument();
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });

  it('renders headings as bold text', () => {
    render(<ChatMessageBubble message={{ id: 'm1', role: 'agent', content: '### Sprint Analysis' }} />);
    const heading = screen.getByText('Sprint Analysis');
    expect(heading.tagName).toBe('H4');
    expect(heading.className).toContain('font-semibold');
  });

  it('renders bullet points', () => {
    render(<ChatMessageBubble message={{ id: 'm1', role: 'agent', content: '- First item\n- Second item' }} />);
    expect(screen.getByText('First item')).toBeInTheDocument();
    expect(screen.getByText('Second item')).toBeInTheDocument();
  });

  it('renders bold inline formatting', () => {
    render(<ChatMessageBubble message={{ id: 'm1', role: 'agent', content: 'This is **important** text' }} />);
    const bold = screen.getByText('important');
    expect(bold.tagName).toBe('STRONG');
  });

  it('renders code inline formatting', () => {
    render(<ChatMessageBubble message={{ id: 'm1', role: 'agent', content: 'Run `npm test` now' }} />);
    const code = screen.getByText('npm test');
    expect(code.tagName).toBe('CODE');
    expect(code.className).toContain('font-mono');
  });

  it('user message has bg-[#262626] styling', () => {
    render(<ChatMessageBubble message={{ id: 'm1', role: 'user', content: 'Test' }} />);
    const bubble = screen.getByText('Test');
    expect(bubble.className).toContain('bg-[#262626]');
  });
});
