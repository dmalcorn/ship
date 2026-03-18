import { useState, useCallback, type KeyboardEvent, type FormEvent } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  documentType: string | null;
  documentTitle?: string;
}

export function ChatInput({ onSend, isLoading, documentType, documentTitle }: ChatInputProps) {
  const [value, setValue] = useState('');

  const placeholder = documentType === 'sprint'
    ? `Ask about this sprint...`
    : `Ask about this issue...`;

  const ariaLabel = documentTitle
    ? `Ask FleetGraph about ${documentTitle}`
    : 'Ask FleetGraph';

  const handleSubmit = useCallback((e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue('');
  }, [value, isLoading, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 bg-[#0d0d0d] border-t border-[#262626] px-3 py-2"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={isLoading}
        rows={1}
        className="flex-1 resize-none bg-transparent text-sm text-[#f5f5f5] placeholder-[#525252] outline-none"
      />
      <button
        type="submit"
        disabled={isLoading || !value.trim()}
        aria-label="Send message"
        className="p-1.5 text-[#a3a3a3] hover:text-[#f5f5f5] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <SendIcon />
        )}
      </button>
    </form>
  );
}

function SendIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
