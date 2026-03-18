import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import type { ChatMessage, ChatResponse } from '../types';

function generateThreadId(): string {
  return crypto.randomUUID();
}

interface ChatRequestBody {
  documentId: string;
  documentType: string;
  message: string;
  threadId: string;
  workspaceId: string;
}

async function sendChatMessage(body: ChatRequestBody): Promise<ChatResponse> {
  const res = await apiPost('/api/fleetgraph/chat', body);
  if (!res.ok) {
    throw new Error('Failed to send chat message');
  }
  return res.json();
}

function formatChatResponse(response: ChatResponse): string {
  const parts: string[] = [];

  if (response.summary) {
    parts.push(response.summary);
  }

  if (response.findings?.length) {
    for (const finding of response.findings) {
      parts.push(`### ${finding.title}`);
      parts.push(finding.description);
      if (finding.evidence) {
        parts.push(`**Evidence:** ${finding.evidence}`);
      }
      if (finding.recommendation) {
        parts.push(`**Recommendation:** ${finding.recommendation}`);
      }
    }
  }

  return parts.join('\n\n');
}

interface UseChatSessionOptions {
  documentId: string | null;
  documentType: string | null;
  workspaceId: string;
}

export function useChatSession({ documentId, documentType, workspaceId }: UseChatSessionOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const threadIdRef = useRef(generateThreadId());
  const messageIdRef = useRef(0);

  function nextMessageId() {
    return `msg-${++messageIdRef.current}`;
  }

  // Reset on document change
  useEffect(() => {
    setMessages([]);
    threadIdRef.current = generateThreadId();
  }, [documentId]);

  const mutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: (data) => {
      const content = formatChatResponse(data);
      setMessages(prev => [...prev, { id: nextMessageId(), role: 'agent', content }]);
    },
    onError: () => {
      setMessages(prev => [...prev, { id: nextMessageId(), role: 'agent', content: '__ERROR__' }]);
    },
  });

  const sendMessage = useCallback((message: string) => {
    if (!documentId || !documentType) return;

    setMessages(prev => [...prev, { id: nextMessageId(), role: 'user', content: message }]);

    mutation.mutate({
      documentId,
      documentType,
      message,
      threadId: threadIdRef.current,
      workspaceId,
    });
  }, [documentId, documentType, workspaceId, mutation]);

  const retry = useCallback(() => {
    if (!documentId || !documentType) return;

    // Find last user message from current state
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    // Remove last error message
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'agent' && last.content === '__ERROR__') {
        return prev.slice(0, -1);
      }
      return prev;
    });

    mutation.mutate({
      documentId,
      documentType,
      message: lastUserMsg.content,
      threadId: threadIdRef.current,
      workspaceId,
    });
  }, [messages, documentId, documentType, workspaceId, mutation]);

  return {
    messages,
    sendMessage,
    retry,
    isLoading: mutation.isPending,
  };
}
