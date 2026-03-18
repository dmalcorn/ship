import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useChatSession } from './useChatSession';

// Mock apiPost
const mockApiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });
  });

  it('starts with empty messages', () => {
    const { result } = renderHook(
      () => useChatSession({ documentId: 'doc-1', documentType: 'issue', workspaceId: 'ws-1' }),
      { wrapper: createWrapper() }
    );
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('adds user message with id on sendMessage', async () => {
    mockApiPost.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: 'Test response', findings: [], severity: 'clean', proposedActions: [] }),
    });

    const { result } = renderHook(
      () => useChatSession({ documentId: 'doc-1', documentType: 'issue', workspaceId: 'ws-1' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.sendMessage('What is the status?');
    });

    // User message should be added immediately with an id
    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: 'What is the status?' });
    expect(result.current.messages[0]!.id).toBeTruthy();
  });

  it('sends correct payload to apiPost', async () => {
    mockApiPost.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: 'Response', findings: [], severity: 'clean', proposedActions: [] }),
    });

    const { result } = renderHook(
      () => useChatSession({ documentId: 'doc-1', documentType: 'sprint', workspaceId: 'ws-1' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.sendMessage('Is this sprint on track?');
    });

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/fleetgraph/chat', {
        documentId: 'doc-1',
        documentType: 'sprint',
        message: 'Is this sprint on track?',
        threadId: 'test-uuid-1234',
        workspaceId: 'ws-1',
      });
    });
  });

  it('adds agent response on success', async () => {
    mockApiPost.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        summary: 'Sprint looks good',
        findings: [],
        severity: 'clean',
        proposedActions: [],
      }),
    });

    const { result } = renderHook(
      () => useChatSession({ documentId: 'doc-1', documentType: 'issue', workspaceId: 'ws-1' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.sendMessage('Status?');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    expect(result.current.messages[1]).toMatchObject({ role: 'agent', content: 'Sprint looks good' });
    expect(result.current.messages[1]!.id).toBeTruthy();
  });

  it('adds error marker on API failure', async () => {
    mockApiPost.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(
      () => useChatSession({ documentId: 'doc-1', documentType: 'issue', workspaceId: 'ws-1' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.sendMessage('Failing question');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    expect(result.current.messages[1]).toMatchObject({ role: 'agent', content: '__ERROR__' });
  });

  it('does not send when documentId is null', () => {
    const { result } = renderHook(
      () => useChatSession({ documentId: null, documentType: null, workspaceId: 'ws-1' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.sendMessage('Should not send');
    });

    expect(mockApiPost).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it('clears messages when documentId changes', async () => {
    mockApiPost.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: 'Response', findings: [], severity: 'clean', proposedActions: [] }),
    });

    const { result, rerender } = renderHook(
      ({ documentId }) => useChatSession({ documentId, documentType: 'issue', workspaceId: 'ws-1' }),
      { wrapper: createWrapper(), initialProps: { documentId: 'doc-1' as string | null } }
    );

    act(() => {
      result.current.sendMessage('Question');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    // Navigate to different document
    rerender({ documentId: 'doc-2' });

    expect(result.current.messages).toEqual([]);
  });

  it('formats findings in response content', async () => {
    mockApiPost.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        summary: 'Found issues',
        findings: [{
          id: 'f1',
          severity: 'warning',
          title: 'Missing assignee',
          description: '2 issues unassigned',
          evidence: 'Issues #4, #7',
          recommendation: 'Assign them',
        }],
        severity: 'warning',
        proposedActions: [],
      }),
    });

    const { result } = renderHook(
      () => useChatSession({ documentId: 'doc-1', documentType: 'sprint', workspaceId: 'ws-1' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.sendMessage('Check sprint');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    const agentMsg = result.current.messages[1]!;
    expect(agentMsg.content).toContain('Found issues');
    expect(agentMsg.content).toContain('### Missing assignee');
    expect(agentMsg.content).toContain('**Evidence:** Issues #4, #7');
    expect(agentMsg.content).toContain('**Recommendation:** Assign them');
  });

  it('retry removes error message and resends last user message', async () => {
    // First call fails
    mockApiPost.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(
      () => useChatSession({ documentId: 'doc-1', documentType: 'issue', workspaceId: 'ws-1' }),
      { wrapper: createWrapper() }
    );

    // Send a message that will fail
    act(() => {
      result.current.sendMessage('Will this fail?');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1]!.content).toBe('__ERROR__');
    });

    // Now retry — mock a success for the retry call
    mockApiPost.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ summary: 'Success now', findings: [], severity: 'clean', proposedActions: [] }),
    });

    await act(async () => {
      result.current.retry();
    });

    // Error message should be removed; retry fires a new mutation
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledTimes(2);
    });

    expect(mockApiPost).toHaveBeenLastCalledWith('/api/fleetgraph/chat', expect.objectContaining({
      message: 'Will this fail?',
    }));

    // Wait for success response
    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1]!.content).toBe('Success now');
    });
  });

  it('retry does nothing when no user messages exist', () => {
    const { result } = renderHook(
      () => useChatSession({ documentId: 'doc-1', documentType: 'issue', workspaceId: 'ws-1' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.retry();
    });

    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
