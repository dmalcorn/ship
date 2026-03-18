import { useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import { ChatInput } from './ChatInput';
import { ChatMessageBubble } from './ChatMessageBubble';
import type { ChatMessage } from '../types';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (message: string) => void;
  onRetry: () => void;
  documentType: string | null;
  documentTitle?: string;
  fabRef: React.RefObject<HTMLButtonElement | null>;
}

export function ChatDrawer({
  isOpen,
  onClose,
  messages,
  isLoading,
  onSend,
  onRetry,
  documentType,
  documentTitle,
  fabRef,
}: ChatDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus trap
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      fabRef.current?.focus();
      return;
    }

    if (e.key === 'Tab') {
      const drawer = drawerRef.current;
      if (!drawer) return;

      const focusable = drawer.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [onClose, fabRef]);

  // Focus close button when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Click-outside-to-close (AC #5)
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
        fabRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, fabRef]);

  const contextLabel = documentTitle
    ? `${documentType === 'sprint' ? 'Sprint' : 'Issue'}: ${documentTitle}`
    : documentType === 'sprint' ? 'Sprint' : 'Issue';

  if (!isOpen) return null;

  return (
    <div
      ref={drawerRef}
      role="dialog"
      aria-label="FleetGraph Chat"
      aria-modal="true"
      onKeyDown={handleKeyDown}
      className="fixed bottom-4 right-4 w-[360px] max-h-[480px] rounded-lg bg-[#171717] border border-[#262626] z-50 flex flex-col shadow-xl transition-transform duration-200 translate-y-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#262626]">
        <span className="text-xs font-medium text-[#a3a3a3] truncate">
          {contextLabel}
        </span>
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close chat"
          className="p-1 text-[#a3a3a3] hover:text-[#f5f5f5] rounded"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto px-3 py-2 space-y-3"
        aria-live="polite"
      >
        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            onRetry={msg.content === '__ERROR__' ? onRetry : undefined}
          />
        ))}
        {isLoading && (
          <div className="text-sm text-[#a3a3a3] animate-pulse">Analyzing...</div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSend}
        isLoading={isLoading}
        documentType={documentType}
        documentTitle={documentTitle}
      />
    </div>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
