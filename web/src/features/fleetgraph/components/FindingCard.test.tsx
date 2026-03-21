import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FindingCard } from './FindingCard';
import type { Finding } from '../types';

// Mock useResumeAction
const mockMutate = vi.fn();
vi.mock('../hooks/useResumeAction', () => ({
  useResumeAction: () => ({
    mutate: mockMutate,
  }),
}));

// Mock useApplyAction
const mockApplyAction = vi.fn();
vi.mock('../hooks/useApplyAction', () => ({
  useApplyAction: () => ({
    mutate: mockApplyAction,
    isPending: false,
  }),
}));

function createFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-1',
    threadId: 'thread-1',
    title: 'Unassigned issues in active sprint',
    description: '3 issues have no assignee in the current sprint.',
    severity: 'warning',
    category: 'sprint-health',
    programPrefix: null,
    affectedDocumentId: 'doc-123',
    affectedDocumentType: 'issue',
    affectedDocumentTitle: 'Sprint 5',
    affectedDocumentCount: 1,
    proposedActions: [{ id: 'action-1', label: 'Self-assign all', description: 'Assign to yourself' }],
    automatedAction: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderCard(finding: Finding, onDismissed?: (id: string) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FindingCard finding={finding} onDismissed={onDismissed} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('FindingCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders finding title, recommendation, and severity', () => {
    renderCard(createFinding());
    expect(screen.getByText('Unassigned issues in active sprint')).toBeInTheDocument();
    // Recommendation shows first proposed action label, not the description
    expect(screen.getByText('Self-assign all')).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
  });

  it('renders severity with correct color class', () => {
    const { container } = renderCard(createFinding({ severity: 'critical' }));
    const severityEl = container.querySelector('.text-\\[\\#f87171\\]');
    expect(severityEl).toBeInTheDocument();
    expect(severityEl?.textContent).toBe('critical');
  });

  it('shows first proposed action label as recommendation text', () => {
    renderCard(createFinding());
    expect(screen.getByText('Self-assign all')).toBeInTheDocument();
  });

  it('falls back to description when no proposedActions', () => {
    renderCard(createFinding({ proposedActions: [] }));
    expect(screen.getByText('3 issues have no assignee in the current sprint.')).toBeInTheDocument();
  });

  it('shows "View Issue" button for single affected document', () => {
    renderCard(createFinding());
    expect(screen.getByText('View Issue')).toBeInTheDocument();
  });

  it('shows "View Issues" button when no specific document', () => {
    renderCard(createFinding({ affectedDocumentId: null, affectedDocumentType: 'issue', affectedDocumentCount: 3 }));
    expect(screen.getByText('View Issues')).toBeInTheDocument();
  });

  it('adds slide-out class on dismiss click and calls onDismissed after transition', async () => {
    vi.useFakeTimers();
    const onDismissed = vi.fn();
    renderCard(createFinding(), onDismissed);
    fireEvent.click(screen.getByLabelText('Dismiss finding: Unassigned issues in active sprint'));
    // Card should have slide-out class applied
    const article = screen.getByRole('article');
    expect(article.className).toContain('translate-x-full');
    // onDismissed fires after transitionend or 200ms fallback
    vi.advanceTimersByTime(200);
    expect(onDismissed).toHaveBeenCalledWith('finding-1');
    vi.useRealTimers();
  });

  it('fires resume mutation with dismiss decision and findingId on dismiss click', () => {
    renderCard(createFinding());
    fireEvent.click(screen.getByLabelText('Dismiss finding: Unassigned issues in active sprint'));
    expect(mockMutate).toHaveBeenCalledWith({ threadId: 'thread-1', decision: 'dismiss', findingId: 'finding-1' });
  });

  it('has role="article" for accessibility', () => {
    renderCard(createFinding());
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('renders info severity with blue color', () => {
    const { container } = renderCard(createFinding({ severity: 'info' }));
    const severityEl = container.querySelector('.text-\\[\\#60a5fa\\]');
    expect(severityEl).toBeInTheDocument();
  });
});
