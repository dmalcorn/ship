import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatInput } from './ChatInput';

describe('ChatInput', () => {
  it('renders with issue placeholder when documentType is issue', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} documentType="issue" />);
    expect(screen.getByPlaceholderText('Ask about this issue...')).toBeInTheDocument();
  });

  it('renders with sprint placeholder when documentType is sprint', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} documentType="sprint" />);
    expect(screen.getByPlaceholderText('Ask about this sprint...')).toBeInTheDocument();
  });

  it('has contextual aria-label when documentTitle provided', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} documentType="issue" documentTitle="Bug #42" />);
    expect(screen.getByLabelText('Ask FleetGraph about Bug #42')).toBeInTheDocument();
  });

  it('calls onSend with trimmed value on Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} documentType="issue" />);

    const input = screen.getByPlaceholderText('Ask about this issue...');
    fireEvent.change(input, { target: { value: '  What is the status?  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('What is the status?');
  });

  it('does not call onSend on Shift+Enter', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} documentType="issue" />);

    const input = screen.getByPlaceholderText('Ask about this issue...');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('clears input after sending', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} documentType="issue" />);

    const input = screen.getByPlaceholderText('Ask about this issue...') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Question' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input.value).toBe('');
  });

  it('disables input and send button when isLoading', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={true} documentType="issue" />);

    const input = screen.getByPlaceholderText('Ask about this issue...');
    expect(input).toBeDisabled();

    const sendBtn = screen.getByLabelText('Send message');
    expect(sendBtn).toBeDisabled();
  });

  it('disables send button when input is empty', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} documentType="issue" />);
    const sendBtn = screen.getByLabelText('Send message');
    expect(sendBtn).toBeDisabled();
  });

  it('does not call onSend with empty input', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} documentType="issue" />);

    const input = screen.getByPlaceholderText('Ask about this issue...');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });
});
