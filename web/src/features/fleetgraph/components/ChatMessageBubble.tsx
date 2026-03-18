import type { ChatMessage } from '../types';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
}

export function ChatMessageBubble({ message, onRetry }: ChatMessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-[#262626] rounded px-3 py-2 text-sm text-[#f5f5f5] max-w-[85%]">
          {message.content}
        </div>
      </div>
    );
  }

  // Error state
  if (message.content === '__ERROR__') {
    return (
      <div className="flex justify-start">
        <div className="text-sm text-[#a3a3a3] max-w-[85%]">
          <p className="m-0">Unable to analyze. Try again.</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-1 text-xs text-[#005ea2] hover:text-[#004d84] underline"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // Agent response — render structured content
  return (
    <div className="flex justify-start">
      <div className="text-sm max-w-[85%] space-y-1.5">
        {renderStructuredContent(message.content)}
      </div>
    </div>
  );
}

function renderStructuredContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Empty line
    if (!line.trim()) {
      continue;
    }

    // Heading (### or ##)
    const headingMatch = line.match(/^#{2,3}\s+(.+)/);
    if (headingMatch) {
      elements.push(
        <h4 key={i} className="text-sm font-semibold text-[#f5f5f5] m-0">
          {headingMatch[1]}
        </h4>
      );
      continue;
    }

    // Bullet point
    if (line.match(/^\s*[-*]\s/)) {
      const bulletText = line.replace(/^\s*[-*]\s/, '');
      elements.push(
        <div key={i} className="flex gap-1.5 text-sm text-[#a3a3a3]">
          <span className="shrink-0">•</span>
          <span>{renderInlineFormatting(bulletText)}</span>
        </div>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-sm text-[#a3a3a3] m-0">
        {renderInlineFormatting(line)}
      </p>
    );
  }

  return elements;
}

function renderInlineFormatting(text: string): React.ReactNode {
  // Handle **bold** and `code` inline
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code
    const codeMatch = remaining.match(/`(.+?)`/);

    // Find earliest match
    const boldIdx = boldMatch?.index ?? Infinity;
    const codeIdx = codeMatch?.index ?? Infinity;

    if (boldIdx === Infinity && codeIdx === Infinity) {
      parts.push(remaining);
      break;
    }

    if (boldIdx <= codeIdx && boldMatch) {
      parts.push(remaining.slice(0, boldIdx));
      parts.push(
        <strong key={key++} className="font-semibold text-[#f5f5f5]">
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldIdx + boldMatch[0].length);
    } else if (codeMatch) {
      parts.push(remaining.slice(0, codeIdx));
      parts.push(
        <code key={key++} className="font-mono text-xs bg-[#262626] px-1 rounded">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeIdx + codeMatch[0].length);
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
